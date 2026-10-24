-- 评论敏感词表（2026-10-24）。
--
-- 为什么放在 D1 而不是随仓库分发：词表里大量是政治/色情/暴恐类词，进公开仓库既可能
-- 触发平台内容审查，也会让仓库本身变成敏感资产。管理员在后台「设置 → 评论敏感词」上传，
-- 整份覆盖（DELETE + 批量 INSERT），上传后立即生效。
--
-- 匹配方式见 src/services/sensitive-words.ts：一条 `instr(?, word) > 0` 全表扫描，
-- 所以词条上限压到 5000（见 lib/sensitive-words.ts 的 SENSITIVE_WORD_LIMIT）。
CREATE TABLE IF NOT EXISTS sensitive_words (
  -- 规范化后的词（去空白/标点/符号、NFKC、小写），也作主键去重
  word       TEXT PRIMARY KEY,
  -- political / porn / religion / gambling / drug / violence / other
  -- 只用于后台统计与排查，判定是「命中任意一类即拦」
  category   TEXT    NOT NULL DEFAULT 'other',
  -- 上传时的原始写法，后台展示用（便于发现「上传的词被规范化了」）
  source     TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensitive_words_category ON sensitive_words(category);
