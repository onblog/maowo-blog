/**
 * Cookie 名与序列化。
 *
 * 三种会话彼此独立：
 *   - `miao_reader`：GitHub 登录的评论者（30 天）
 *   - `miao_admin` ：后台作者（7 天）
 *   - `miao_oauth` ：OAuth 跳转中的 state 暂存（10 分钟）
 * 同一个项目在 127.0.0.1 上跑多个站点时，前缀保证互不覆盖。
 */
export const READER_COOKIE = "miao_reader";
export const READER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ADMIN_COOKIE = "miao_admin";
export const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const OAUTH_STATE_COOKIE = "miao_oauth";
export const OAUTH_STATE_TTL_SECONDS = 600;

export const THEME_COOKIE = "miao_theme";
export const LOCALE_COOKIE = "miao_locale";
export const PREF_TTL_SECONDS = 365 * 24 * 60 * 60;

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * 序列化 Cookie。Secure 只在 https 下加 —— 本地 http://127.0.0.1 开发时
 * 浏览器会直接丢弃 Secure Cookie，登录会表现为"登录成功但仍未登录"。
 */
export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAgeSeconds?: number; secure: boolean; path?: string; httpOnly?: boolean },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (opts.secure) parts.push("Secure");
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join("; ");
}
