-- 后台作者账号（单行表，id 恒为 1）。
--
-- 为什么从环境变量搬进 D1：作者要能在后台自助修改账号与密码。
-- 环境变量（ADMIN_USER / ADMIN_PASS）只能改部署配置 —— 改一次密码就得重新部署一次，
-- 线上没法运维。落库之后，这张表是后台账号密码的**唯一来源**。
--
-- 这里**不写入初始行**：出厂账号 admin/admin 必须先经 PBKDF2 加盐哈希才能落库，
-- 而哈希需要 Web Crypto，SQL 里算不出来。播种由 src/services/admin.ts 的
-- ensureAdminAccount() 在首次读取时完成（INSERT OR IGNORE，并发安全）。
CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  -- PBKDF2-SHA256 派生出的 32 字节密钥（base64）
  password_hash TEXT NOT NULL,
  -- 每条记录独立的 16 字节随机盐（base64）：同一个密码在不同实例上哈希不同
  salt TEXT NOT NULL,
  -- 迭代次数随记录落库：将来调高默认值时老记录仍按各自的值校验，不必全员重设密码
  iterations INTEGER NOT NULL,
  -- 1 = 仍是出厂默认口令（admin/admin）。登录后先改密，其他后台接口一律 403。
  must_change INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- 作废所有旧的后台会话。
--
-- 旧会话的 user_json 里只有 { username }，没有 mustChange 标记；若不清理，部署之后
-- 手里还攥着旧 Cookie 的人可以继续用默认口令 admin/admin 登录后台、最长 7 天，
-- 「强制改密」就被绕过去了。删掉之后所有人必须重新登录一次，新会话才会带上标记。
DELETE FROM sessions WHERE kind = 'admin';
