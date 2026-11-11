import { excerpt } from "../lib/markdown";

/**
 * 站内搜索。
 *
 * 规模判断：这是单人博客，文章量在几百篇量级，直接对 `posts` 做 LIKE 扫描
 * 比维护一份 FTS5 索引更划算 —— 后者要为增删改各写一套触发器，还要保证
 * 历史数据回填，收益却要到几千篇以后才出现。真需要时再换。
 *
 * 语义：
 * - 空格分隔多个关键词，**全部命中**才算结果（AND）；
 * - 每个关键词在标题、摘要、正文、标签名里任意一处命中即可；
 * - 排序优先级：标题完全相同 > 标题包含 > 置顶 > 发布时间；
 * - 返回的摘要优先取「含关键词的上下文」，而不是永远截正文开头。
 */

const MAX_QUERY_LENGTH = 64;
const MAX_TERMS = 5;
const SNIPPET_LENGTH = 150;

export type SearchHit = {
  slug: string;
  title: string;
  snippet: string;
  publishedAt: number;
  readingMinutes: number;
};

export type SearchResult = {
  query: string;
  terms: string[];
  total: number;
  hits: SearchHit[];
};

type SearchRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: number | null;
  created_at: number;
  reading_minutes: number;
  content_slice: string | null;
  total: number;
};

/** LIKE 的通配符转义：用户输入的 `%` / `_` 应当当作普通字符 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * 归一化查询：折叠空白、按码位截断、去重、最多 5 个词。
 * 返回 `query` 用于展示与回填，`terms` 用于 SQL 与高亮。
 */
export function parseQuery(raw: string | null | undefined): { query: string; terms: string[] } {
  const collapsed = (raw ?? "").replace(/\s+/g, " ").trim();
  const query = Array.from(collapsed).slice(0, MAX_QUERY_LENGTH).join("");

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of query.split(" ")) {
    const key = part.toLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    terms.push(part);
    if (terms.length >= MAX_TERMS) break;
  }
  return { query, terms };
}

function containsTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

/**
 * 摘要优先级：含关键词的 excerpt → 含关键词的正文切片 → 任意 excerpt。
 * 正文切片由 SQL 在命中位置附近截取，避免把整篇 content_md 读进 Worker。
 */
function buildSnippet(row: SearchRow, terms: string[]): string {
  const excerptText = (row.excerpt ?? "").trim();
  if (excerptText && containsTerm(excerptText, terms)) {
    return excerpt(excerptText, SNIPPET_LENGTH);
  }

  const slice = row.content_slice ?? "";
  if (slice && containsTerm(slice, terms)) {
    const cleaned = excerpt(slice, SNIPPET_LENGTH);
    if (cleaned) return cleaned;
  }
  return excerpt(excerptText || slice, SNIPPET_LENGTH);
}

export async function searchPublished(env: Env, rawQuery: string, limit = 20): Promise<SearchResult> {
  const { query, terms } = parseQuery(rawQuery);
  if (terms.length === 0) return { query, terms, total: 0, hits: [] };

  const first = terms[0];
  if (!first) return { query, terms, total: 0, hits: [] };

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);

  // 每个词的四条命中路径：标题 / 摘要 / 正文 / 标签名。多词之间是 AND。
  const termClause = `(p.title LIKE ? ESCAPE '\\'
      OR COALESCE(p.excerpt, '') LIKE ? ESCAPE '\\'
      OR p.content_md LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM post_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id AND t.name LIKE ? ESCAPE '\\'
      ))`;
  const whereSql = terms.map(() => termClause).join(" AND ");
  const termBinds = terms.flatMap((term) => {
    const pattern = `%${escapeLike(term)}%`;
    return [pattern, pattern, pattern, pattern];
  });

  /*
   * 正文只取 200 字切片：文章全文 3MB 级别，`SELECT *` 会把几百 KB 塞进
   * 每次输入触发的请求里。`instr` 找到第一个关键词的位置，往前挪 40 字作为上下文。
   * `COUNT(*) OVER()` 与主查询共用一次扫描，省掉单独跑一遍 COUNT。
   */
  const sql = `SELECT p.slug, p.title, p.excerpt, p.published_at, p.created_at, p.reading_minutes,
      substr(p.content_md, max(1, instr(lower(p.content_md), lower(?)) - 40), 200) AS content_slice,
      COUNT(*) OVER() AS total
    FROM posts p
    WHERE p.status = 'published' AND ${whereSql}
    ORDER BY
      CASE
        WHEN lower(p.title) = lower(?) THEN 2
        WHEN instr(lower(p.title), lower(?)) > 0 THEN 1
        ELSE 0
      END DESC,
      p.pinned DESC,
      p.published_at DESC
    LIMIT ?`;

  const { results } = await env.DB.prepare(sql)
    .bind(first, ...termBinds, first, first, safeLimit)
    .all<SearchRow>();

  const total = results[0]?.total ?? 0;
  return {
    query,
    terms,
    total,
    hits: results.map((row) => ({
      slug: row.slug,
      title: row.title,
      snippet: buildSnippet(row, terms),
      publishedAt: row.published_at ?? row.created_at,
      readingMinutes: row.reading_minutes,
    })),
  };
}
