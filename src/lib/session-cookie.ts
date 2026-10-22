import type { Context } from "hono";
import {
  ADMIN_COOKIE,
  ADMIN_TTL_MS,
  LOCALE_COOKIE,
  PREF_TTL_SECONDS,
  READER_COOKIE,
  READER_TTL_MS,
  serializeCookie,
} from "./cookies";
import type { AppEnv } from "../types";

/** 本地 http://127.0.0.1 开发时不能带 Secure，否则浏览器直接丢弃 Cookie */
function isSecure(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function append(c: Context<AppEnv>, value: string): void {
  c.header("Set-Cookie", value, { append: true });
}

export function setReaderCookie(c: Context<AppEnv>, token: string): void {
  append(c, serializeCookie(READER_COOKIE, token, {
    maxAgeSeconds: Math.floor(READER_TTL_MS / 1000),
    secure: isSecure(c),
  }));
}

export function clearReaderCookie(c: Context<AppEnv>): void {
  append(c, serializeCookie(READER_COOKIE, "", { maxAgeSeconds: 0, secure: isSecure(c) }));
}

export function setAdminCookie(c: Context<AppEnv>, token: string): void {
  append(c, serializeCookie(ADMIN_COOKIE, token, {
    maxAgeSeconds: Math.floor(ADMIN_TTL_MS / 1000),
    secure: isSecure(c),
  }));
}

export function clearAdminCookie(c: Context<AppEnv>): void {
  append(c, serializeCookie(ADMIN_COOKIE, "", { maxAgeSeconds: 0, secure: isSecure(c) }));
}

/** 主题与语言是「用户偏好」而非凭证：不加 HttpOnly（内联脚本要在首屏前读它们） */
export function setLocaleCookie(c: Context<AppEnv>, locale: "zh" | "en"): void {
  append(c, serializeCookie(LOCALE_COOKIE, locale, {
    maxAgeSeconds: PREF_TTL_SECONDS,
    secure: isSecure(c),
    httpOnly: false,
  }));
}

