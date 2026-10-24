-- 评论者身份表（GitHub OAuth 是唯一登录方式）。
--
-- 为什么单独建表，而不是只靠评论行里冗余的 login / avatar_url：
--   1. 身份真源：评论行里的作者信息是**发表时的快照**（历史留在当时，评论不因改名失真），
--      而这张表记的是「这个 GitHub 账号现在是谁」，登录时按 github_id upsert。
--   2. 限流与统计需要稳定的账号锚点：每人每日评论上限按 github_id 统计，不依赖任何一行评论。
--   3. 联系方式：email 只在这里存一份，且只用于账号识别与站务联系（不展示、不返回、日志不记录）。
--
-- github_id 作主键：GitHub 上数字 id 永不改变，login 可以改名转让。
-- 从旧版本升级：历史评论不会反向补出用户行，账号第一次登录时自然落库。
CREATE TABLE IF NOT EXISTS users (
  github_id     INTEGER PRIMARY KEY,
  login         TEXT    NOT NULL,
  -- GitHub 账号的 primary 邮箱（只取已验证的地址；用户取消邮箱授权时为空）。
  -- ⚠️ 本次没拿到时用 COALESCE 保留旧值，不被 null 覆盖。
  email         TEXT,
  avatar_url    TEXT,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
