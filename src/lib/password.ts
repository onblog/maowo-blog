import type { MessageKey } from "./i18n";

/**
 * 后台密码的哈希与校验（PBKDF2-SHA256 + 每条记录独立的随机盐）。
 *
 * 为什么不用 MD5 / SHA-256 这类「快哈希」：它们是为文件校验设计的，一张普通显卡每秒
 * 能试几十亿次，数据库一旦泄漏基本等于明文。PBKDF2 是**故意算得慢**的哈希。
 *
 * 迭代次数取 10,000：单次派生约 3–6ms CPU。Workers 免费版每个请求只有 10ms CPU
 * 额度（超出报 1102），这个值留足了余量。迭代次数随记录落库，将来升级套餐后只需
 * 调高 PASSWORD_ITERATIONS，老记录仍按各自的值校验，不需要让作者重设密码。
 */
export const PASSWORD_ITERATIONS = 10_000;

/** 出厂默认账号与密码：**只在 D1 里还没有记录时**写入一次，登录后强制修改。 */
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;

/** 需要落库的哈希三件套。salt / iterations 必须与 hash 一起存，否则无法复核。 */
export type PasswordHash = {
  hash: string;
  salt: string;
  iterations: number;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 定长比较，避免通过耗时差异推测哈希前缀。 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function deriveBits(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  // 显式复制一份：TextEncoder 返回 Uint8Array<ArrayBufferLike>，Web Crypto 的
  // 参数类型只接受 ArrayBuffer 支撑的视图。
  const raw = new Uint8Array(new TextEncoder().encode(password));
  const key = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(password, salt, iterations);
  return { hash: toBase64(derived), salt: toBase64(salt), iterations };
}

export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  const derived = await deriveBits(password, fromBase64(stored.salt), stored.iterations);
  return constantTimeEqual(toBase64(derived), stored.hash);
}

/**
 * 账号名校验：合法返回 null，否则返回错误文案。
 *
 * 限制成「字母 / 数字 / 下划线 / 连字符」：账号名会出现在后台页头与日志里，
 * 允许空格与符号会让这些地方出现无法一眼分辨的名字。
 */
export function validateUsername(value: string): MessageKey | null {
  if (value.length < MIN_USERNAME_LENGTH || value.length > MAX_USERNAME_LENGTH) {
    return "admin.account.error.username_length";
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return "admin.account.error.username_charset";
  return null;
}

/** 新密码校验：合法返回 null，否则返回 i18n 键。 */
export function validatePassword(password: string, username: string): MessageKey | null {
  // 「不能继续用出厂默认值」排最前：admin 只有 5 位，若先报"太短"，
  // 作者会以为是长度问题，看不出真正该改的是"别再用默认口令"。
  if (password === DEFAULT_ADMIN_PASSWORD) return "admin.account.error.default_password";
  if (password.length < MIN_PASSWORD_LENGTH) return "admin.account.error.password_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "admin.account.error.password_long";
  if (password === username) return "admin.account.error.same_as_username";
  return null;
}
