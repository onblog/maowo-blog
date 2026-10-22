import { slugify } from "../lib/brand";
import { ulid } from "../lib/id";
import type { PostRow, SeriesRow } from "../types";

/**
 * 合集（series）。
 *
 * 设计取舍：
 * - 一篇文章最多属于一个合集（`posts.series_id`），不做多对多 —— 合集是「一本书」，
 *   不是标签。想同时归类用标签。
 * - **没有排序字段**：合集内按发布时间正序展示（连载从第 1 篇读起）。手动排序需要
 *   拖拽 UI + 维护序号的并发写入，收益远小于成本。
 * - 合集按名字懒创建：作者在编辑器里填名字，第一次保存时建表记录。
 */

export async function resolveSeries(env: Env, name: string | null | undefined): Promise<string | null> {
  const trimmed = (name ?? "").trim().slice(0, 40);
  if (!trimmed) return null;

  const slug = slugify(trimmed, "series");
  const existing = await env.DB.prepare("SELECT id FROM series WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = ulid();
  await env.DB.prepare(
    "INSERT INTO series (id, slug, name, description, created_at) VALUES (?, ?, ?, NULL, ?)",
  )
    .bind(id, slug, trimmed, Date.now())
    .run();
  return id;
}

export async function getSeriesById(env: Env, id: string): Promise<SeriesRow | null> {
  return env.DB.prepare("SELECT * FROM series WHERE id = ?").bind(id).first<SeriesRow>();
}

export async function getSeriesBySlug(env: Env, slug: string): Promise<SeriesRow | null> {
  return env.DB.prepare("SELECT * FROM series WHERE slug = ?").bind(slug).first<SeriesRow>();
}

/** 全部合集 + 已发布篇数（空合集不出现，避免作者建了又弃用留下幽灵入口） */
export async function listSeries(
  env: Env,
): Promise<Array<SeriesRow & { post_count: number; last_at: number | null }>> {
  const { results } = await env.DB.prepare(
    `SELECT s.*, COUNT(p.id) AS post_count, MAX(p.published_at) AS last_at
       FROM series s
       JOIN posts p ON p.series_id = s.id AND p.status = 'published'
      GROUP BY s.id
      ORDER BY last_at DESC`,
  ).all<SeriesRow & { post_count: number; last_at: number | null }>();
  return results;
}

/** 合集内的文章：按发布时间正序（第 1 篇在前） */
export async function listSeriesPosts(env: Env, seriesId: string): Promise<PostRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE series_id = ? AND status = 'published' ORDER BY published_at ASC",
  )
    .bind(seriesId)
    .all<PostRow>();
  return results;
}

/** 供编辑器 datalist 用：全部合集名 */
export async function listSeriesNames(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT name FROM series ORDER BY name").all<{ name: string }>();
  return results.map((row) => row.name);
}
