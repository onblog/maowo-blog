import { withTimeout } from "../lib/html";

/**
 * GitHub OAuth：评论者身份的唯一来源。
 *
 * 刻意只申请 `read:user`：
 *   - 不申请 `user:email` —— 评论不需要邮箱，站点也就不存邮箱，少一份隐私责任；
 *   - 不申请任何 repo 权限。
 * access_token 用完即弃，不落库。
 */
export const GITHUB_SCOPE = "read:user";
export const GITHUB_CALLBACK_PATH = "/api/auth/github/callback";

const GITHUB_TIMEOUT_MS = 10_000;

export type GithubProfile = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  bad_verification_code: "授权已失效，请重新登录",
  incorrect_client_credentials: "GitHub 应用配置有误，请联系站点管理员",
  redirect_uri_mismatch: "回调地址与 GitHub 应用配置不一致，请联系站点管理员",
  profile_request_failed: "读取 GitHub 资料失败，请重试",
  token_request_failed: "连接 GitHub 失败，请重试",
  token_request_timeout: "连接 GitHub 超时，请重试",
  profile_request_timeout: "读取 GitHub 资料超时，请重试",
};

export class GithubAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GithubAuthError";
    this.code = code;
  }
}

export function githubErrorMessage(err: unknown): string {
  if (err instanceof GithubAuthError) {
    return CALLBACK_ERROR_MESSAGES[err.code] ?? "登录失败，请重试";
  }
  return "登录失败，请重试";
}

/**
 * 回调地址由 SITE_URL 推导，**不从请求 Host 推导**：
 * 否则本地用 localhost 访问时会生成与 OAuth App 注册地址不一致的 redirect_uri。
 */
export function githubCallbackUrl(env: Env): string {
  return new URL(GITHUB_CALLBACK_PATH, env.SITE_URL).toString();
}

export function buildAuthorizeUrl(env: Env, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", githubCallbackUrl(env));
  url.searchParams.set("scope", GITHUB_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(env: Env, code: string): Promise<string> {
  const res = await withTimeout(
    fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: githubCallbackUrl(env),
      }),
    }),
    GITHUB_TIMEOUT_MS,
    "连接 GitHub",
  ).catch((err: unknown) => {
    throw new GithubAuthError("token_request_timeout", err instanceof Error ? err.message : String(err));
  });

  if (!res.ok) throw new GithubAuthError("token_request_failed", `换取 token 失败：HTTP ${res.status}`);

  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (body.error || !body.access_token) {
    throw new GithubAuthError(body.error ?? "no_access_token", body.error_description ?? "未取得 access_token");
  }
  return body.access_token;
}

export async function fetchGithubProfile(token: string): Promise<GithubProfile> {
  const res = await withTimeout(
    fetch("https://api.github.com/user", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "miao-blog",
        "x-github-api-version": "2022-11-28",
      },
    }),
    GITHUB_TIMEOUT_MS,
    "读取 GitHub 资料",
  ).catch((err: unknown) => {
    throw new GithubAuthError("profile_request_timeout", err instanceof Error ? err.message : String(err));
  });

  if (!res.ok) throw new GithubAuthError("profile_request_failed", `获取 GitHub 资料失败：HTTP ${res.status}`);

  const body = (await res.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  if (typeof body.id !== "number" || !body.login) {
    throw new GithubAuthError("invalid_profile", "GitHub 返回的资料缺少 id 或 login");
  }

  return {
    id: body.id,
    login: body.login,
    name: body.name?.trim() ? body.name.trim().slice(0, 40) : null,
    avatarUrl: body.avatar_url ?? null,
  };
}
