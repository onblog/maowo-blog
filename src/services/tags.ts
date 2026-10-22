import type { TagRow } from "../types";

/** 全部标签 + 每个标签下的已发布文章数 */
export async function listTags(env: Env): Promise<TagRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.slug, t.name, COUNT(p.id) AS post_count
       FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
      GROUP BY t.id
      ORDER BY post_count DESC, t.name ASC`,
  ).all<TagRow>();
  return results;
}

export async function getTagBySlug(env: Env, slug: string): Promise<TagRow | null> {
  return env.DB.prepare("SELECT id, slug, name FROM tags WHERE slug = ?").bind(slug).first<TagRow>();
}
