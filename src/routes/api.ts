import { Hono } from "hono";
import type { Context } from "hono";
import { ADMIN_COOKIE, ADMIN_TTL_MS, readCookie } from "../lib/cookies";
import { safeUrl } from "../lib/html";
import { t } from "../lib/i18n";
import {
  MAX_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  validatePassword,
  validateUsername,
} from "../lib/password";
import { createSession, deleteSession, pruneExpiredSessions } from "../lib/session";
import { clearAdminCookie, setAdminCookie } from "../lib/session-cookie";
import { requireAdminApi } from "../middleware/guards";
import { deleteAdminSessions, updateAdminCredentials, verifyAdminPassword } from "../services/admin";
import {
  COMMENT_COOLDOWN_SECONDS,
  DAILY_COMMENT_LIMIT,
  DAILY_COMMENT_LIMIT_PER_USER,
  countToday,
  countTodayByUser,
  createComment,
  lastCommentAt,
  remove,
  setStatus,
} from "../services/comments";
import { createPost, deletePost, getById, getPublishedBySlug, updatePost } from "../services/posts";
import { parseSensitiveWordList, sensitiveSummaryText } from "../lib/sensitive-words";
import {
  clearSensitiveWords,
  exportSensitiveWords,
  replaceSensitiveWords,
  scanComment,
  sensitiveWordStats,
  type SensitiveWordStats,
} from "../services/sensitive-words";
import { renderMarkdown } from "../lib/markdown";
import { getSite, updateSite } from "../services/site";
import type { AppEnv, Locale } from "../types";

export const api = new Hono<AppEnv>();

// ── 登录限流：isolate 内存计数。冷启动会重置，但足以挡住脚本化爆破；
//    更强的防护交给 Cloudflare Access（可选开启）或 WAF。
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function clientIp(c: Context<AppEnv>): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}

function throttleLogin(ip: string): { blocked: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) return { blocked: false, retryAfter: 0 };
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return { blocked: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { blocked: false, retryAfter: 0 };
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

// ── 评论 ────────────────────────────────────────────────────────────────────

api.post("/comments", async (c) => {
  const reader = c.get("reader");
  if (!reader) return c.json({ error: "unauthorized" }, 401);

  const body = await c.req.json<{
    postId?: string;
    postSlug?: string;
    parentId?: string | null;
    body?: string;
    website?: string;
  }>();
  const postId = (body.postId ?? "").trim();
  const postSlug = (body.postSlug ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!postId && !postSlug) return c.json({ error: "post_required" }, 400);
  if (!text) return c.json({ error: "body_required" }, 400);

  const post = postId ? await getById(c.env, postId) : await getPublishedBySlug(c.env, postSlug);
  if (!post || post.status !== "published") return c.json({ error: "post_not_found" }, 404);

  const site = await getSite(c.env);
  if (site.comments_enabled !== 1) return c.json({ error: "comments_disabled" }, 403);

  // 敏感词前置拦截：命中就不入库、不占额度，直接告诉用户「包含不当内容」。
  // 提示刻意**不说是哪一类**：告诉刷词的人命中了哪个分类，等于把词表结构泄给他。
  // 日志里只记分类与长度，不记命中的词，也不记评论原文。
  const banned = await scanComment(c.env, text);
  if (banned.hit) {
    console.log(
      JSON.stringify({
        level: "warn",
        msg: "comment.banned_word",
        id: c.get("requestId"),
        postId: post.id,
        userId: reader.githubId,
        category: banned.category,
        contentLength: text.length,
      }),
    );
    return c.json({ error: "banned_content" }, 400);
  }

  const last = await lastCommentAt(c.env, reader.githubId);
  if (last && Date.now() - last < COMMENT_COOLDOWN_SECONDS * 1000) {
    return c.json({ error: "too_fast", retryAfter: COMMENT_COOLDOWN_SECONDS }, 429);
  }

  // 全站每日上限：防脚本把评论区刷爆
  const todayCount = await countToday(c.env);
  if (todayCount >= DAILY_COMMENT_LIMIT) {
    return c.json({ error: "daily_limit", limit: DAILY_COMMENT_LIMIT, count: todayCount }, 429);
  }

  // 账号每日上限：真正的闸门。GitHub 登录保证「有人」而不是匿名，再给每人的额度封顶，
  // 一个人注册再多小号也受全站上限兜底。统计按 github_id，改名不换额度桶。
  const userToday = await countTodayByUser(c.env, reader.githubId);
  if (userToday >= DAILY_COMMENT_LIMIT_PER_USER) {
    return c.json(
      { error: "user_daily_limit", limit: DAILY_COMMENT_LIMIT_PER_USER, count: userToday },
      429,
    );
  }

  const website = body.website ? safeUrl(body.website) : null;
  const comment = await createComment(c.env, {
    postId: post.id,
    parentId: body.parentId ?? null,
    body: text,
    website,
    reader,
  });

  return c.json({ ok: true, comment }, 201);
});

// ── 改密限流：这个接口同时是「当前密码是否正确」的判定器 —— 不限流就能拿来试密码。
//    与登录一样用 isolate 内存计数，冷启动会重置；真正的兜底交给强口令 + Cloudflare Access（可选）。
const accountAttempts = new Map<string, { count: number; resetAt: number }>();
const ACCOUNT_MAX_ATTEMPTS = 5;
const ACCOUNT_WINDOW_MS = 60 * 1000;

function throttleAccount(ip: string): boolean {
  const now = Date.now();
  const entry = accountAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    accountAttempts.set(ip, { count: 1, resetAt: now + ACCOUNT_WINDOW_MS });
    return true;
  }
  if (entry.count >= ACCOUNT_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

// ── 后台：会话 ──────────────────────────────────────────────────────────────

api.post("/admin/login", async (c) => {
  const ip = clientIp(c);
  const throttle = throttleLogin(ip);
  if (throttle.blocked) {
    c.header("retry-after", String(throttle.retryAfter));
    return c.json({ error: "too_many_attempts", retryAfter: throttle.retryAfter }, 429);
  }

  const body = await c.req.json<{ username?: string; password?: string }>();
  const account = await verifyAdminPassword(c.env, body.username ?? "", body.password ?? "");
  if (!account) {
    recordFailure(ip);
    // 不区分「账号不存在」与「密码错」，防账号枚举。
    return c.json({ error: "invalid_credentials" }, 401);
  }

  loginAttempts.delete(ip);
  await pruneExpiredSessions(c.env);
  const mustChange = account.must_change === 1;
  const token = await createSession(c.env, "admin", { username: account.username, mustChange }, ADMIN_TTL_MS);
  setAdminCookie(c, token);
  // mustChange 只是给前端的**提前提示**；真正的强制在页面守卫与 requireAdminApi。
  return c.json({ ok: true, username: account.username, mustChange });
});

api.post("/admin/logout", async (c) => {
  const token = readCookie(c.req.header("cookie"), ADMIN_COOKIE);
  await deleteSession(c.env, token);
  clearAdminCookie(c);
  return c.json({ ok: true });
});

// ── 后台：账号与密码 ────────────────────────────────────────────────────────

/**
 * 修改后台账号与密码。
 *
 * 刻意**不挂 requireAdminApi**：出厂默认口令期间，那个守卫会把这里也一起 403 掉，
 * 作者就永远出不去。这里改为自己判断登录态（只放行"已登录"）。
 *
 * 改完之后 `deleteAdminSessions` + 重新签发：作者本人不被踢下线，其他设备上的后台
 * 会话立刻失效。
 */
api.post("/admin/account", async (c) => {
  const admin = c.get("admin");
  if (!admin) return c.json({ error: "unauthorized" }, 401);

  const locale = c.get("locale");
  const ip = clientIp(c);
  if (!throttleAccount(ip)) {
    return c.json({ error: "too_many_requests", message: t(locale, "admin.account.error.too_many") }, 429);
  }

  const body = await c.req.json<{ currentPassword?: string; username?: string; password?: string }>();

  // 改密必须验一次当前密码：会话 Cookie 只能证明"这个浏览器登录过"，
  // 证明不了"现在操作的是一个知道密码的人"（别人趁你没锁屏也能改）。
  const account = await verifyAdminPassword(c.env, admin.username, body.currentPassword ?? "");
  if (!account) {
    return c.json({ error: "invalid_current_password", message: t(locale, "admin.account.error.current") }, 400);
  }

  const nextUsername = (body.username ?? "").trim() || account.username;
  const usernameError = validateUsername(nextUsername);
  if (usernameError) {
    return c.json(
      { error: "invalid_username", message: t(locale, usernameError, { min: MIN_USERNAME_LENGTH, max: MAX_USERNAME_LENGTH }) },
      400,
    );
  }

  const password = body.password ?? "";
  const passwordError = validatePassword(password, nextUsername);
  if (passwordError) {
    return c.json(
      { error: "invalid_password", message: t(locale, passwordError, { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH }) },
      400,
    );
  }
  // 再挡一次"新密码 = 旧密码"：否则强制改密可以原地交作业，默认口令照样生效。
  if (await verifyAdminPassword(c.env, account.username, password)) {
    return c.json({ error: "same_password", message: t(locale, "admin.account.error.same_password") }, 400);
  }

  const updated = await updateAdminCredentials(c.env, { username: nextUsername, password });
  await deleteAdminSessions(c.env);
  const token = await createSession(c.env, "admin", { username: updated.username, mustChange: false }, ADMIN_TTL_MS);
  setAdminCookie(c, token);
  return c.json({ ok: true, username: updated.username, mustChange: false });
});

// ── 后台：文章 ──────────────────────────────────────────────────────────────

type PostBody = {
  title?: string;
  slug?: string;
  content_md?: string;
  excerpt?: string;
  cover_image?: string;
  cover_alt?: string;
  lang?: Locale;
  pinned?: boolean;
  status?: "draft" | "published";
  tags?: string;
  series?: string | null;
  /** 自定义发布时间（Unix 毫秒）。字段缺省 = 不改；显式 null = 清空 */
  published_at?: number | null;
};

function normalizePostBody(body: PostBody): { ok: true; value: PostBody & { title: string; content_md: string } } | { ok: false; error: string } {
  const title = (body.title ?? "").trim();
  const content = body.content_md ?? "";
  if (!title) return { ok: false, error: "title_required" };
  if (content.length > 512 * 1024) return { ok: false, error: "content_too_large" };
  return { ok: true, value: { ...body, title: title.slice(0, 200), content_md: content } };
}

/** 请求体（snake_case）→ 服务层入参（camelCase）；只在这里做一次转换 */
function toPostInput(body: PostBody & { title: string; content_md: string }) {
  return {
    ...body,
    series: body.series === undefined ? undefined : body.series === null ? null : String(body.series).trim(),
    publishedAt:
      body.published_at === undefined
        ? undefined
        : typeof body.published_at === "number"
          ? body.published_at
          : null,
  };
}

api.post("/admin/posts", requireAdminApi, async (c) => {
  const parsed = normalizePostBody(await c.req.json<PostBody>());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const post = await createPost(c.env, toPostInput(parsed.value));
  return c.json({ ok: true, post }, 201);
});

api.put("/admin/posts/:id", requireAdminApi, async (c) => {
  const parsed = normalizePostBody(await c.req.json<PostBody>());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  try {
    const post = await updatePost(c.env, c.req.param("id"), toPostInput(parsed.value));
    return c.json({ ok: true, post });
  } catch {
    return c.json({ error: "post_not_found" }, 404);
  }
});

/** 列出全部文章（Agent 拿 id 用；后台列表页走 SSR，不依赖这里） */
api.get("/admin/posts", requireAdminApi, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, slug, title, status, lang, pinned, views, reading_minutes, published_at, series_id, created_at, updated_at FROM posts ORDER BY published_at DESC LIMIT 500",
  ).all<Record<string, unknown>>();
  return c.json({ ok: true, posts: results });
});

api.get("/admin/posts/:id", requireAdminApi, async (c) => {
  const post = await getById(c.env, c.req.param("id"));
  if (!post) return c.json({ error: "post_not_found" }, 404);
  const { results } = await c.env.DB.prepare(
    "SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ? ORDER BY t.name",
  )
    .bind(post.id)
    .all<{ name: string }>();
  return c.json({ ok: true, post, tags: results.map((row) => row.name) });
});

api.delete("/admin/posts/:id", requireAdminApi, async (c) => {
  await deletePost(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

// ── 后台：评论 ──────────────────────────────────────────────────────────────

api.post("/admin/comments/:id/status", requireAdminApi, async (c) => {
  const body = await c.req.json<{ status?: string }>();
  const status = body.status === "hidden" ? "hidden" : body.status === "visible" ? "visible" : null;
  if (!status) return c.json({ error: "invalid_status" }, 400);
  await setStatus(c.env, c.req.param("id"), status);
  return c.json({ ok: true });
});

api.delete("/admin/comments/:id", requireAdminApi, async (c) => {
  await remove(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

// ── 后台：评论敏感词 ────────────────────────────────────────────────────────
//
// 词表整份覆盖：上传的 txt 就是「当前全部词」，支持删词。空文件等于停用。
// 词表不进仓库（见 migrations/0009 的说明），所以这里也是唯一的维护入口。
// 后台界面只做「上传 / 下载 / 清空」三件事，**不展示词表内容** —— 它不是给人读的。

api.get("/admin/sensitive-words", requireAdminApi, async (c) => {
  const stats = await sensitiveWordStats(c.env);
  return c.json({ ok: true, ...stats, summary: sensitiveSummaryText(c.get("locale"), stats) });
});

api.put("/admin/sensitive-words", requireAdminApi, async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const parsed = parseSensitiveWordList(body.text ?? "");
  await replaceSensitiveWords(c.env, parsed.entries);
  console.log(
    JSON.stringify({
      level: "info",
      msg: "sensitive-words.updated",
      id: c.get("requestId"),
      total: parsed.entries.length,
      skipped: parsed.skipped,
      truncated: parsed.truncated,
    }),
  );
  // 重新查一次统计再回给前端，避免「前端自己算」把分类分布算漂
  const stats = await sensitiveWordStats(c.env);
  return c.json({
    ok: true,
    total: parsed.entries.length,
    skipped: parsed.skipped,
    truncated: parsed.truncated,
    limit: parsed.entries.length + parsed.truncated,
    summary: sensitiveSummaryText(c.get("locale"), stats),
  });
});

/**
 * 下载当前词表：与上传格式一致（`# 分类` + 每行一个词），下载后可直接再上传覆盖。
 * 用 cookie 鉴权（浏览器点链接会自带），不走 JSON 包装。
 */
api.get("/admin/sensitive-words/export", requireAdminApi, async (c) => {
  const text = await exportSensitiveWords(c.env);
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="sensitive-words.txt"',
      "cache-control": "no-store",
    },
  });
});

api.delete("/admin/sensitive-words", requireAdminApi, async (c) => {
  await clearSensitiveWords(c.env);
  const stats = await sensitiveWordStats(c.env);
  return c.json({ ok: true, ...stats, summary: sensitiveSummaryText(c.get("locale"), stats) });
});

// ── 后台：站点设置 ──────────────────────────────────────────────────────────

api.put("/admin/site", requireAdminApi, async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, string | number | null> = {};
  const stringFields = [
    "name",
    "tagline",
    "owner_name",
    "owner_bio",
    "owner_avatar",
    "owner_github",
    "owner_email",
    "owner_location",
    "owner_links",
    "color_mode",
    "accent",
    "seo_description",
  ];
  for (const field of stringFields) {
    if (typeof body[field] === "string") patch[field] = (body[field] as string).slice(0, 2000);
  }
  if (typeof body.comments_enabled === "boolean") patch.comments_enabled = body.comments_enabled ? 1 : 0;
  if (typeof body.comments_enabled === "number") patch.comments_enabled = body.comments_enabled ? 1 : 0;

  const site = await updateSite(c.env, patch);
  return c.json({ ok: true, site });
});

api.post("/admin/preview", requireAdminApi, async (c) => {
  const body = await c.req.json<{ content_md?: string }>();
  return c.json({ ok: true, html: renderMarkdown(body.content_md ?? "") });
});

// ── 后台：全站导出（「进得来也出得去」是抢存量用户的信任前提）──────────────
api.get("/admin/export", requireAdminApi, async (c) => {
  const site = await getSite(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.content_md, p.excerpt, p.cover_image, p.cover_alt, p.lang,
            p.status, p.pinned, p.published_at, p.created_at, s.name AS series_name
       FROM posts p
       LEFT JOIN series s ON s.id = p.series_id
      ORDER BY p.published_at ASC, p.created_at ASC`,
  ).all<Record<string, unknown> & { id: string }>();

  // 标签分批补齐（D1 单条查询的绑定参数有限）
  const tagMap = new Map<string, string[]>();
  const ids = results.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { results: tagRows } = await c.env.DB.prepare(
      `SELECT pt.post_id, t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id IN (${chunk.map(() => "?").join(",")}) ORDER BY t.name`,
    )
      .bind(...chunk)
      .all<{ post_id: string; name: string }>();
    for (const row of tagRows) {
      const list = tagMap.get(row.post_id) ?? [];
      list.push(row.name);
      tagMap.set(row.post_id, list);
    }
  }

  const posts = results.map((row) => ({
    ...row,
    tags: tagMap.get(row.id) ?? [],
  }));

  return c.json({ version: 2, exported_at: Date.now(), site, posts });
});

