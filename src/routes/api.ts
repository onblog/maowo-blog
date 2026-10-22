import { Hono } from "hono";
import type { Context } from "hono";
import { ADMIN_COOKIE, ADMIN_TTL_MS, readCookie } from "../lib/cookies";
import { safeUrl, timingSafeEqual } from "../lib/html";
import { createSession, deleteSession, pruneExpiredSessions } from "../lib/session";
import { clearAdminCookie, setAdminCookie } from "../lib/session-cookie";
import { requireAdminApi } from "../middleware/guards";
import { COMMENT_COOLDOWN_SECONDS, createComment, lastCommentAt, remove, setStatus } from "../services/comments";
import { createPost, deletePost, getById, getPublishedBySlug, updatePost } from "../services/posts";
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

  const last = await lastCommentAt(c.env, reader.githubId);
  if (last && Date.now() - last < COMMENT_COOLDOWN_SECONDS * 1000) {
    return c.json({ error: "too_fast", retryAfter: COMMENT_COOLDOWN_SECONDS }, 429);
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

// ── 后台：会话 ──────────────────────────────────────────────────────────────

api.post("/admin/login", async (c) => {
  const ip = clientIp(c);
  const throttle = throttleLogin(ip);
  if (throttle.blocked) {
    c.header("retry-after", String(throttle.retryAfter));
    return c.json({ error: "too_many_attempts", retryAfter: throttle.retryAfter }, 429);
  }

  const body = await c.req.json<{ username?: string; password?: string }>();
  const expectedUser = c.env.ADMIN_USER ?? "";
  const expectedPass = c.env.ADMIN_PASS ?? "";

  if (!expectedUser || !expectedPass) {
    return c.json({ error: "admin_not_configured", message: "请在部署时设置 ADMIN_USER / ADMIN_PASS" }, 500);
  }

  const userOk = timingSafeEqual(body.username ?? "", expectedUser);
  const passOk = timingSafeEqual(body.password ?? "", expectedPass);
  if (!userOk || !passOk) {
    recordFailure(ip);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  loginAttempts.delete(ip);
  await pruneExpiredSessions(c.env);
  const token = await createSession(c.env, "admin", { username: expectedUser }, ADMIN_TTL_MS);
  setAdminCookie(c, token);
  return c.json({ ok: true });
});

api.post("/admin/logout", async (c) => {
  const token = readCookie(c.req.header("cookie"), ADMIN_COOKIE);
  await deleteSession(c.env, token);
  clearAdminCookie(c);
  return c.json({ ok: true });
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
    "SELECT id, slug, title, status, lang, pinned, views, reading_minutes, published_at, series_id, created_at, updated_at FROM posts ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 500",
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
    "theme",
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
    "SELECT slug, title, content_md, excerpt, cover_image, lang, status, pinned, published_at, created_at FROM posts ORDER BY created_at",
  ).all<Record<string, unknown>>();
  c.header("content-disposition", 'attachment; filename="miao-blog-export.json"');
  return c.json({ version: 1, exported_at: Date.now(), site, posts: results });
});

