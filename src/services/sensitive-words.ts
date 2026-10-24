/**
 * 评论敏感词：D1 读写与扫描。
 *
 * 匹配策略刻意用**一条 SQL 全表扫描**，而不是把词表读进 Worker 再建 trie：
 *
 * ```sql
 * SELECT word, category FROM sensitive_words WHERE instr(?, word) > 0 LIMIT 1
 * ```
 *
 * 理由：
 * 1. 评论接口调用频率极低（个人博客一天几条），一次 5000 行的 `instr` 扫描在 D1 上是毫秒级；
 * 2. 没有 Worker 侧缓存，管理员上传后**立刻**生效，不存在「缓存没刷新」这类问题；
 * 3. 不用在每次请求里重复建索引结构，CPU 时间可控。
 *
 * 代价是每次检测按词表行数计 D1 读行数，所以上传上限压到 5000 词（见 `SENSITIVE_WORD_LIMIT`）。
 */
import { normalizeForMatch, type SensitiveWordEntry } from "../lib/sensitive-words";

export type ScanResult =
  | { hit: false }
  | { hit: true; category: string; word: string };

/** 单批 INSERT 的行数：4 个参数/行 × 100 = 400，远低于 D1 的 999 参数上限。 */
const INSERT_BATCH = 100;

/**
 * 扫描一段评论。**命中即返回**，不告诉调用方命中了几处。
 *
 * 传入的文本先规范化（去空白/标点/符号、小写），词表里存的也是规范化形式，
 * 所以「敏_感 词」与「敏感词」等价。文本规范化后为空（纯表情）时直接放行，省一次查询。
 */
export async function scanComment(env: Env, text: string): Promise<ScanResult> {
  const normalized = normalizeForMatch(text);
  if (normalized === "") return { hit: false };

  const row = await env.DB.prepare(
    "SELECT word, category FROM sensitive_words WHERE instr(?, word) > 0 LIMIT 1",
  )
    .bind(normalized)
    .first<{ word: string; category: string }>();
  return row ? { hit: true, category: row.category, word: row.word } : { hit: false };
}

export type SensitiveWordStats = {
  total: number;
  categories: Array<{ category: string; count: number }>;
};

export async function sensitiveWordStats(env: Env): Promise<SensitiveWordStats> {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM sensitive_words").first<{ n: number }>();
  const { results } = await env.DB.prepare(
    "SELECT category, COUNT(*) AS n FROM sensitive_words GROUP BY category ORDER BY n DESC",
  ).all<{ category: string; n: number }>();
  return {
    total: countRow?.n ?? 0,
    categories: results.map((row) => ({ category: row.category, count: row.n })),
  };
}

/**
 * 整份覆盖词表：先清空，再分批插入。
 *
 * 用 `DELETE` + 多值 `INSERT` 而不是逐条 upsert：管理员的语义是「这份文件就是全部词」，
 * 增量合并会让删词变得不可能。批数上限由 `SENSITIVE_WORD_LIMIT` 保证（最多 50 条语句）。
 */
export async function replaceSensitiveWords(env: Env, entries: SensitiveWordEntry[]): Promise<void> {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM sensitive_words")];

  for (let i = 0; i < entries.length; i += INSERT_BATCH) {
    const chunk = entries.slice(i, i + INSERT_BATCH);
    const values = chunk.map(() => "(?, ?, ?, ?)").join(", ");
    statements.push(
      env.DB.prepare(
        `INSERT INTO sensitive_words (word, category, source, created_at) VALUES ${values}`,
      ).bind(...chunk.flatMap((entry) => [entry.word, entry.category, entry.source, now])),
    );
  }

  await env.DB.batch(statements);
}

/** 清空词表（后台「停用」按钮）：之后所有评论都不再被词表拦截。 */
export async function clearSensitiveWords(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM sensitive_words").run();
}
