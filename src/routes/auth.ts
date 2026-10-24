import { Hono } from "hono";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  READER_TTL_MS,
  readCookie,
  serializeCookie,
} from "../lib/cookies";
import { safeNextPath, timingSafeEqual } from "../lib/security";
import { createSession, deleteSession } from "../lib/session";
import { clearReaderCookie, setReaderCookie } from "../lib/session-cookie";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubProfile,
  fetchPrimaryEmail,
  githubErrorMessage,
} from "../services/github";
import { upsertGithubUser } from "../services/users";
import type { AppEnv, ReaderUser } from "../types";

/**
 * 评论者身份：GitHub OAuth（唯一登录方式）。
 *
 * 流程刻意做得最短：
 *   start → 302 GitHub → callback → 建 reader 会话 → 302 回到原页面
 * 没有"完善资料"这一步：头像、昵称、登录名都来自 GitHub，站点不额外收集任何东西。
 */
export const authRoutes = new Hono<AppEnv>();

function newState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isSecure(c: { req: { url: string } }): boolean {
  return new URL(c.req.url).protocol === "https:";
}

authRoutes.get("/github/start", (c) => {
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.html(
      `<main style="font-family:system-ui;padding:48px;max-width:560px;margin:0 auto;line-height:1.8">
         <h1>GitHub 登录尚未配置</h1>
         <p>请在部署时设置环境变量 <code>GITHUB_CLIENT_ID</code> 与 <code>GITHUB_CLIENT_SECRET</code>，
         并在 GitHub 上创建 OAuth App，回调地址填 <code>${c.env.SITE_URL}/api/auth/github/callback</code>。</p>
         <p><a href="/">返回首页</a></p>
       </main>`,
      500,
    );
  }

  const next = safeNextPath(c.req.query("next"));
  const state = newState();
  const cookieValue = `${state}|${encodeURIComponent(next)}`;

  c.header(
    "Set-Cookie",
    serializeCookie(OAUTH_STATE_COOKIE, cookieValue, {
      maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
      secure: isSecure(c),
    }),
  );
  return c.redirect(buildAuthorizeUrl(c.env, state), 302);
});

authRoutes.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") ?? "";
  const cookieValue = readCookie(c.req.header("cookie"), OAUTH_STATE_COOKIE);

  if (!cookieValue) {
    return c.html(renderError("授权会话已过期，请重新登录"), 400);
  }
  const [expectedState, encodedNext] = cookieValue.split("|");
  const next = safeNextPath(encodedNext ? decodeURIComponent(encodedNext) : "/");

  if (!code || !expectedState || !timingSafeEqual(expectedState, state)) {
    return c.html(renderError("授权校验失败，请重新登录"), 400);
  }

  try {
    const token = await exchangeCodeForToken(c.env, code);
    // 邮箱是附加信息：拿不到（用户取消授权 / 接口失败）只落 null，不影响登录。
    // 与 GitHub 资料并行请求，省一次往返；资料失败会抛错，登录照常失败。
    const [profile, email] = await Promise.all([fetchGithubProfile(token), fetchPrimaryEmail(token)]);
    // 身份真源落库：upsert 失败说明库有问题，登录应当失败，而不是发一个没有账号依据的会话。
    // 每人每日评论上限按这里的 github_id 统计。
    await upsertGithubUser(c.env, {
      githubId: profile.id,
      login: profile.login,
      email,
      avatarUrl: profile.avatarUrl,
      now: Date.now(),
    });
    const reader: ReaderUser = {
      githubId: profile.id,
      login: profile.login,
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
    };
    const sessionToken = await createSession(c.env, "reader", reader, READER_TTL_MS);
    setReaderCookie(c, sessionToken);
    // 用完即清：state 只服务于一次跳转
    c.header("Set-Cookie", serializeCookie(OAUTH_STATE_COOKIE, "", { maxAgeSeconds: 0, secure: isSecure(c) }), {
      append: true,
    });
    return c.redirect(next, 302);
  } catch (err) {
    return c.html(renderError(githubErrorMessage(err)), 400);
  }
});

authRoutes.post("/logout", async (c) => {
  const token = readCookie(c.req.header("cookie"), "miao_reader");
  await deleteSession(c.env, token);
  clearReaderCookie(c);
  return c.json({ ok: true });
});

function renderError(message: string): string {
  return `<main style="font-family:system-ui;padding:48px;max-width:560px;margin:0 auto;line-height:1.8">
    <h1>登录失败</h1>
    <p>${message.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch] ?? ch)}</p>
    <p><a href="/">返回首页</a></p>
  </main>`;
}
