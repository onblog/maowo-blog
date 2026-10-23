/**
 * 会话存取。
 *
 * 库里**只存 token 的 sha256**：即便 D1 备份泄漏，也无法直接拿来登录。
 * token 本身是 32 字节随机数，Base64URL 编码后进 Cookie。
 */
import type { ReaderUser } from "../types";

export type SessionKind = "reader" | "admin";

export type SessionRow = {
  id: string;
  kind: SessionKind;
  user_json: string | null;
  created_at: number;
  expires_at: number;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(
  env: Env,
  kind: SessionKind,
  user: ReaderUser | { username: string; mustChange?: boolean } | null,
  ttlMs: number,
): Promise<string> {
  const token = newToken();
  const id = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (id, kind, user_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, kind, user ? JSON.stringify(user) : null, now, now + ttlMs)
    .run();
  return token;
}

export async function readSession(env: Env, token: string | null): Promise<SessionRow | null> {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT * FROM sessions WHERE id = ?")
    .bind(id)
    .first<SessionRow>();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  return row;
}

export async function deleteSession(env: Env, token: string | null): Promise<void> {
  if (!token) return;
  const id = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
}

/** 顺手清理过期会话（后台登录时调用，不需要 cron） */
export async function pruneExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
}
