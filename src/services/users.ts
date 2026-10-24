/**
 * 评论者身份：GitHub OAuth 登录成功后落库。
 *
 * 这是「这个 GitHub 账号现在是谁」的唯一真源；评论行里的 login / display_name /
 * avatar_url 只是发表时的快照（回答「当时显示什么名字」，不随改名变化）。
 *
 * `email` 只用于账号识别与站务联系：**不返回给前端、不在页面展示、不写日志**。
 */
export type GithubUserRow = {
  github_id: number;
  login: string;
  email: string | null;
  avatar_url: string | null;
  created_at: number;
  last_login_at: number;
};

export type UpsertGithubUserInput = {
  githubId: number;
  login: string;
  /** 本次登录拿到的 primary 邮箱；没拿到传 null，库里的旧值会保留 */
  email: string | null;
  avatarUrl: string | null;
  now: number;
};

/**
 * 按 `github_id` upsert，返回落库后的行。
 *
 * 用 `ON CONFLICT(github_id)` 而不是「先查再插」：并发登录不会撞唯一约束。
 * 每次登录同步 login / avatar_url / email；`email` 走 `COALESCE` —— 用户偶发取消
 * 邮箱授权不该让库里已有的联系方式被 null 覆盖。
 */
export async function upsertGithubUser(env: Env, input: UpsertGithubUserInput): Promise<GithubUserRow> {
  await env.DB.prepare(
    `INSERT INTO users (github_id, login, email, avatar_url, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET
       login         = excluded.login,
       email         = COALESCE(excluded.email, users.email),
       avatar_url    = excluded.avatar_url,
       last_login_at = excluded.last_login_at`,
  )
    .bind(input.githubId, input.login, input.email, input.avatarUrl, input.now, input.now)
    .run();

  const row = await env.DB.prepare("SELECT * FROM users WHERE github_id = ?")
    .bind(input.githubId)
    .first<GithubUserRow>();
  if (!row) throw new Error("user_upsert_failed");
  return row;
}
