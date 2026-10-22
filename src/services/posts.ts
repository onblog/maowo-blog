import { excerpt as extractExcerpt } from "../lib/markdown";
import { readingMinutes, slugify } from "../lib/brand";
import { siteLocale } from "../lib/i18n";
import { getSeriesById, resolveSeries } from "./series";
import { ulid } from "../lib/id";
import type { Locale, PostRow, PostSummary, TagRow } from "../types";

const PAGE_SIZE = 10;

export type ListOptions = {
  page?: number;
  perPage?: number;
  lang?: Locale | null;
  tagSlug?: string | null;
  seriesSlug?: string | null;
};

export type ListResult = {
  items: PostSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

function clampPage(page: number | undefined): number {
  const value = Math.floor(Number(page ?? 1));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * 给一批文章补上标签。
 *
 * ⚠️ 必须分批：D1 对单条查询的绑定参数有上限，归档页一次要处理全部已发布文章
 * （259 篇 → 259 个 `?`），一次 IN 会直接 500。每批 50 个既安全又不慢。
 */
const TAG_CHUNK = 50;

async function attachTags(env: Env, rows: PostRow[]): Promise<PostSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const byPost = new Map<string, TagRow[]>();

  for (let i = 0; i < ids.length; i += TAG_CHUNK) {
    const chunk = ids.slice(i, i + TAG_CHUNK);
    const { results } = await env.DB.prepare(
      `SELECT pt.post_id, t.id, t.slug, t.name
         FROM post_tags pt
         JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id IN (${chunk.map(() => "?").join(",")})
        ORDER BY t.name`,
    )
      .bind(...chunk)
      .all<{ post_id: string; id: string; slug: string; name: string }>();

    for (const row of results) {
      const list = byPost.get(row.post_id) ?? [];
      list.push({ id: row.id, slug: row.slug, name: row.name });
      byPost.set(row.post_id, list);
    }
  }

  return rows.map((row) => ({ ...row, tags: byPost.get(row.id) ?? [] }));
}

/** 已发布文章的分页列表（首页 / 标签页 / 归档共用） */
export async function listPublished(env: Env, options: ListOptions = {}): Promise<ListResult> {
  const perPage = Math.min(Math.max(options.perPage ?? PAGE_SIZE, 1), 50);
  const page = clampPage(options.page);
  const where: string[] = ["status = 'published'"];
  const bind: unknown[] = [];

  if (options.lang) {
    where.push("lang = ?");
    bind.push(options.lang);
  }
  if (options.tagSlug) {
    where.push(
      "id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.slug = ?)",
    );
    bind.push(options.tagSlug);
  }
  if (options.seriesSlug) {
    where.push("series_id = (SELECT id FROM series WHERE slug = ?)");
    bind.push(options.seriesSlug);
  }
  const whereSql = where.join(" AND ");

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${whereSql}`)
    .bind(...bind)
    .first<{ n: number }>();
  const total = countRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);

  const { results } = await env.DB.prepare(
    `SELECT * FROM posts WHERE ${whereSql}
      ORDER BY pinned DESC, published_at DESC
      LIMIT ? OFFSET ?`,
  )
    .bind(...bind, perPage, (safePage - 1) * perPage)
    .all<PostRow>();

  return {
    items: await attachTags(env, results),
    total,
    page: safePage,
    perPage,
    totalPages,
  };
}

export async function getPublishedBySlug(env: Env, slug: string): Promise<PostSummary | null> {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'")
    .bind(slug)
    .first<PostRow>();
  if (!row) return null;
  const [withTags] = await attachTags(env, [row]);
  if (!withTags) return null;
  if (row.series_id) withTags.series = await getSeriesById(env, row.series_id);
  return withTags;
}

export async function getBySlugAdmin(env: Env, slug: string): Promise<PostRow | null> {
  return env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first<PostRow>();
}

export async function getById(env: Env, id: string): Promise<PostRow | null> {
  return env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<PostRow>();
}

export async function listAllForAdmin(env: Env): Promise<PostRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts ORDER BY updated_at DESC LIMIT 500",
  ).all<PostRow>();
  return results;
}

/** 相邻文章：站点只有一种语言（SITE_LOCALE），直接按发布时间取 */
export async function getNeighbours(
  env: Env,
  post: PostRow,
): Promise<{ prev: PostRow | null; next: PostRow | null }> {
  const publishedAt = post.published_at ?? 0;
  const prev = await env.DB.prepare(
    `SELECT * FROM posts WHERE status = 'published' AND published_at > ?
      ORDER BY published_at ASC LIMIT 1`,
  )
    .bind(publishedAt)
    .first<PostRow>();
  const next = await env.DB.prepare(
    `SELECT * FROM posts WHERE status = 'published' AND published_at < ?
      ORDER BY published_at DESC LIMIT 1`,
  )
    .bind(publishedAt)
    .first<PostRow>();
  return { prev, next };
}

export async function incrementViews(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").bind(id).run();
}

export type PostInput = {
  title: string;
  slug?: string | null;
  content_md: string;
  excerpt?: string | null;
  cover_image?: string | null;
  cover_alt?: string | null;
  lang?: Locale;
  pinned?: boolean;
  status?: "draft" | "published";
  tags?: string;
  /** 合集名；留空表示不属于任何合集。懒创建。 */
  series?: string | null;
  /** 自定义发布时间（Unix 毫秒）；不传则发布时用当前时间，草稿保持原值 */
  publishedAt?: number | null;
};

/** 把 "a, b，c" 拆成标签数组，去重去空 */
export function parseTags(input: string | undefined | null): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 30)),
    ),
  ).slice(0, 8);
}

/**
 * 分配纯数字 slug：以「当前时刻毫秒」为基准，撞了就 +1。
 *
 * 为什么不用标题生成：中文标题转写出来是一串中文（长短不一、还随标题变动），
 * 改个标题链接就变；而毫秒时间戳是 13 位定长数字，天然接近唯一，冲突递增即可。
 * 分配后**永不改变** —— 改标题、改合集都不会让已分享的链接失效。
 */
async function allocateNumericSlug(env: Env, base: number): Promise<string> {
  for (let i = 0; i < 1000; i += 1) {
    const candidate = String(base + i);
    const exists = await env.DB.prepare("SELECT 1 AS hit FROM posts WHERE slug = ?")
      .bind(candidate)
      .first<{ hit: number }>();
    if (!exists) return candidate;
  }
  throw new Error("slug_alloc_failed");
}


/** 重建一篇文章的标签关联（标签本身按 slug upsert） */
async function syncTags(env: Env, postId: string, tagNames: string[]): Promise<void> {
  await env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId).run();
  if (tagNames.length === 0) return;

  const now = Date.now();
  const statements = tagNames.map((name) => {
    const slug = slugify(name, "tag");
    return env.DB.prepare(
      "INSERT INTO tags (id, slug, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING",
    ).bind(ulid(now), slug, name, now);
  });
  await env.DB.batch(statements);

  const tagRows = await env.DB.prepare(
    `SELECT id, slug FROM tags WHERE slug IN (${tagNames.map(() => "?").join(",")})`,
  )
    .bind(...tagNames.map((name) => slugify(name, "tag")))
    .all<{ id: string; slug: string }>();

  const links = tagRows.results.map((row) =>
    env.DB.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(postId, row.id),
  );
  if (links.length > 0) await env.DB.batch(links);
}

export async function createPost(env: Env, input: PostInput): Promise<PostRow> {
  const now = Date.now();
  const id = ulid(now);
  const slug = await allocateNumericSlug(env, now);
  const status = input.status ?? "draft";
  // 作者可以指定发布时间；没指定时，发布即当前时间、草稿为空
  const publishedAt = input.publishedAt ?? (status === "published" ? now : null);
  const seriesId = await resolveSeries(env, input.series);

  await env.DB.prepare(
    `INSERT INTO posts (id, slug, title, content_md, excerpt, cover_image, cover_alt, lang, status,
                        pinned, views, reading_minutes, published_at, series_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      slug,
      input.title,
      input.content_md,
      input.excerpt?.trim() || extractExcerpt(input.content_md, 160),
      input.cover_image || null,
      input.cover_alt || null,
      siteLocale(env),
      status,
      input.pinned ? 1 : 0,
      readingMinutes(input.content_md),
      publishedAt,
      seriesId,
      now,
      now,
    )
    .run();

  await syncTags(env, id, parseTags(input.tags));
  const row = await getById(env, id);
  if (!row) throw new Error("post_create_failed");
  return row;
}

export async function updatePost(env: Env, id: string, input: PostInput): Promise<PostRow> {
  const existing = await getById(env, id);
  if (!existing) throw new Error("post_not_found");

  const now = Date.now();
  // 地址一经分配就不再改：标题与合集的变化与链接无关
  const slug = existing.slug;
  const status = input.status ?? existing.status;
  // 作者显式给了发布时间就用它；否则首次发布补当前时间，之后再编辑不动它
  const publishedAt =
    input.publishedAt !== undefined
      ? input.publishedAt
      : status === "published"
        ? existing.published_at ?? now
        : existing.published_at;
  const seriesId = await resolveSeries(env, input.series);

  await env.DB.prepare(
    `UPDATE posts SET slug = ?, title = ?, content_md = ?, excerpt = ?, cover_image = ?, cover_alt = ?,
            lang = ?, status = ?, pinned = ?, reading_minutes = ?, published_at = ?, series_id = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      slug,
      input.title,
      input.content_md,
      input.excerpt?.trim() || extractExcerpt(input.content_md, 160),
      input.cover_image || null,
      input.cover_alt || null,
      siteLocale(env),
      status,
      input.pinned ? 1 : 0,
      readingMinutes(input.content_md),
      publishedAt,
      seriesId,
      now,
      id,
    )
    .run();

  await syncTags(env, id, parseTags(input.tags));
  const row = await getById(env, id);
  if (!row) throw new Error("post_update_failed");
  return row;
}

export async function deletePost(env: Env, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id),
    env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(id),
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id),
  ]);
}

/** 首页统计：文章数 / 总字数 / 标签数 */
export async function siteStats(env: Env): Promise<{ posts: number; words: number; tags: number }> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM posts WHERE status = 'published') AS posts,
       (SELECT COALESCE(SUM(LENGTH(content_md)), 0) FROM posts WHERE status = 'published') AS chars,
       (SELECT COUNT(DISTINCT pt.tag_id) FROM post_tags pt
          JOIN posts p ON p.id = pt.post_id AND p.status = 'published') AS tags`,
  ).first<{ posts: number; chars: number; tags: number }>();
  return {
    posts: row?.posts ?? 0,
    words: Math.round((row?.chars ?? 0) / 1000),
    tags: row?.tags ?? 0,
  };
}

/**
 * 归档：按年分组。
 *
 * ⚠️ 只查元数据列：归档页只需要标题与日期，`SELECT *` 会把 259 篇全文（3MB+）
 * 一次性读进 Worker —— 文章一多直接 500。列表类查询永远不要带 content_md。
 */
export async function archiveGroups(
  env: Env,
): Promise<Array<{ year: string; posts: PostRow[] }>> {
  const { results } = await env.DB.prepare(
    `SELECT id, series_id, slug, title, '' AS content_md, excerpt, cover_image, cover_alt, lang, status,
            pinned, views, reading_minutes, published_at, created_at, updated_at
       FROM posts WHERE status = 'published' ORDER BY published_at DESC`,
  ).all<PostRow>();
  // 归档页只渲染标题与日期，不需要标签 —— 省掉一批 JOIN 查询
  const groups = new Map<string, PostRow[]>();
  for (const post of results) {
    const year = String(new Date(post.published_at ?? post.created_at).getUTCFullYear());
    const list = groups.get(year) ?? [];
    list.push(post);
    groups.set(year, list);
  }
  return Array.from(groups.entries()).map(([year, posts]) => ({ year, posts }));
}
