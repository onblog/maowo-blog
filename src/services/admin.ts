import type { AdminAccount } from "../types";
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  constantTimeEqual,
  hashPassword,
  verifyPassword,
} from "../lib/password";

/**
 * 后台账号（单行表 `admin_credentials`，见 migrations/0007）。
 *
 * 它与作者/读者体系**完全无关**：不在 users 表里，也不参与 GitHub 登录。
 * 从环境变量搬进 D1 的唯一理由是「后台要能自助改账号密码」——
 * 环境变量改一次要重新部署一次，线上没法运维。
 */

const SELECT = "SELECT * FROM admin_credentials WHERE id = 1";

export async function getAdminAccount(env: Env): Promise<AdminAccount | null> {
  return env.DB.prepare(SELECT).first<AdminAccount>();
}

/**
 * 读取后台账号；没有记录时用出厂默认账号 admin/admin 播种。
 *
 * 播种放在代码里而不是迁移：密码必须先经 PBKDF2 加盐哈希才能落库，SQL 里算不出哈希。
 *
 * 用 `INSERT OR IGNORE` 而不是「先查再插」：并发冷启动时后到的那次会撞主键并被
 * 静默忽略，不会 500，也不会写出两行。
 */
export async function ensureAdminAccount(env: Env): Promise<AdminAccount> {
  const existing = await getAdminAccount(env);
  if (existing) return existing;

  const seeded = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO admin_credentials
       (id, username, password_hash, salt, iterations, must_change, updated_at)
     VALUES (1, ?1, ?2, ?3, ?4, 1, ?5)`,
  )
    .bind(DEFAULT_ADMIN_USERNAME, seeded.hash, seeded.salt, seeded.iterations, Date.now())
    .run();

  const created = await getAdminAccount(env);
  if (!created) throw new Error("后台账号初始化失败：请确认 migrations 已应用");
  return created;
}

/**
 * 校验后台账号密码。
 *
 * 两段都走定长比较；**账号不匹配也照样跑一次 PBKDF2**，否则「账号错」会比
 * 「密码错」返回得快一个数量级，攻击者据此可以先把账号枚举出来。
 */
export async function verifyAdminPassword(env: Env, username: string, password: string): Promise<AdminAccount | null> {
  const account = await ensureAdminAccount(env);
  const userOk = constantTimeEqual(username, account.username);
  const passOk = await verifyPassword(password, {
    hash: account.password_hash,
    salt: account.salt,
    iterations: account.iterations,
  });
  return userOk && passOk ? account : null;
}

/**
 * 修改后台账号与密码。
 *
 * `must_change` 必须同时归零：否则改完密码仍会被强制改密页拦住。
 */
export async function updateAdminCredentials(
  env: Env,
  patch: { username: string; password: string },
): Promise<AdminAccount> {
  const hashed = await hashPassword(patch.password);
  await env.DB.prepare(
    `UPDATE admin_credentials
        SET username = ?1, password_hash = ?2, salt = ?3, iterations = ?4, must_change = 0, updated_at = ?5
      WHERE id = 1`,
  )
    .bind(patch.username, hashed.hash, hashed.salt, hashed.iterations, Date.now())
    .run();

  const updated = await getAdminAccount(env);
  if (!updated) throw new Error("后台账号更新失败");
  return updated;
}

/**
 * 作废全部后台会话。
 *
 * 会话是 D1 落库的（`sessions.kind = 'admin'`），所以改密后直接删掉即可：
 * 旧 token 立刻失效，不需要像无状态 Cookie 那样维护版本号。
 * 调用方随后会给当前浏览器签发一张新的，作者本人不会被踢下线。
 */
export async function deleteAdminSessions(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE kind = 'admin'").run();
}
