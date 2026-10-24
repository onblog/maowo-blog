import { ulid } from "../lib/id";
import type { CommentNode, CommentRow, ReaderUser } from "../types";

/** 评论冷却：同一个 GitHub 账号两次提交的最小间隔（秒） */
export const COMMENT_COOLDOWN_SECONDS = 10;

/**
 * 每个 GitHub 账号每天（UTC）最多能发表的评论条数。
 *
 * 与 toolstack 保持同一口径：**被隐藏/待审核的也算**，否则只要内容被拦就不计数，
 * 刷屏者可以无限重试。这是账号维度真正的闸门 —— 全站上限只防「大量账号协同刷」。
 */
export const DAILY_COMMENT_LIMIT_PER_USER = 10;

/**
 * 全站每天最多接受的评论条数。
 * 单人博客一天几十条评论已属异常，100 是防脚本刷屏的兜底；正常写作远到不了。
 */
export const DAILY_COMMENT_LIMIT = 100;

/** 今天（UTC）已收到的评论条数，用于全站上限判断 */
export async function countToday(env: Env): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE created_at >= ?")
    .bind(start.getTime())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 今天（UTC）这个 GitHub 账号已发表多少条评论（所有状态都算）。
 *
 * 按 `github_id` 而不是 login：改名不会换一个额度桶。
 */
export async function countTodayByUser(env: Env, githubId: number): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE github_id = ? AND created_at >= ?")
    .bind(githubId, start.getTime())
    .first<{ n: number }>();
  return row?.n ?? 0;
}
export const COMMENT_MAX_CHARS = 3000;

export async function listVisible(env: Env, postId: string): Promise<CommentRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM comments WHERE post_id = ? AND status = 'visible' ORDER BY created_at ASC",
  )
    .bind(postId)
    .all<CommentRow>();
  return results;
}

/** 平铺评论 → 两层树（顶层 + 回复）。回复挂在直接父级下，不做无限嵌套 */
export function buildTree(rows: CommentRow[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  const roots: CommentNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parentId = row.root_id && row.root_id !== row.id ? row.root_id : null;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function countForPost(env: Env, postId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM comments WHERE post_id = ? AND status = 'visible'",
  )
    .bind(postId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type CreateCommentInput = {
  postId: string;
  parentId: string | null;
  body: string;
  website: string | null;
  reader: ReaderUser;
};

export async function createComment(env: Env, input: CreateCommentInput): Promise<CommentRow> {
  const now = Date.now();
  const id = ulid(now);
  let rootId: string | null = null;

  if (input.parentId) {
    const parent = await env.DB.prepare("SELECT id, root_id FROM comments WHERE id = ? AND post_id = ?")
      .bind(input.parentId, input.postId)
      .first<{ id: string; root_id: string | null }>();
    // 父评论不存在（被删/伪造）就直接挂顶层，而不是报错——用户的文字不该白写
    if (parent) rootId = parent.root_id ?? parent.id;
  }

  await env.DB.prepare(
    `INSERT INTO comments (id, post_id, parent_id, root_id, github_id, login, display_name, avatar_url,
                          website, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'visible', ?, ?)`,
  )
    .bind(
      id,
      input.postId,
      input.parentId,
      rootId,
      input.reader.githubId,
      input.reader.login,
      input.reader.displayName,
      input.reader.avatarUrl,
      input.website,
      input.body.slice(0, COMMENT_MAX_CHARS),
      now,
      now,
    )
    .run();

  const row = await env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(id).first<CommentRow>();
  if (!row) throw new Error("comment_create_failed");
  return row;
}

/** 同一账号最近一条评论的时间戳（冷却判断） */
export async function lastCommentAt(env: Env, githubId: number): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT created_at FROM comments WHERE github_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(githubId)
    .first<{ created_at: number }>();
  return row?.created_at ?? 0;
}

export async function setStatus(env: Env, id: string, status: CommentRow["status"]): Promise<void> {
  await env.DB.prepare("UPDATE comments SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, Date.now(), id)
    .run();
}

export async function remove(env: Env, id: string): Promise<void> {
  // 回复也一并删掉，避免留下指向空节点的孤儿
  await env.DB.prepare("DELETE FROM comments WHERE id = ? OR root_id = ? OR parent_id = ?")
    .bind(id, id, id)
    .run();
}

export async function listAll(
  env: Env,
  limit = 100,
): Promise<Array<CommentRow & { post_title: string | null; post_slug: string | null }>> {
  const { results } = await env.DB.prepare(
    `SELECT c.*, p.title AS post_title, p.slug AS post_slug
       FROM comments c LEFT JOIN posts p ON p.id = c.post_id
      ORDER BY c.created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<CommentRow & { post_title: string | null; post_slug: string | null }>();
  return results;
}
