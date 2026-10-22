-- 合集（series）：一篇文章可选地属于一个合集。
-- 排序**只按发布时间正序**（连载从第 1 篇读起），不提供手动排序字段 —— 少一个要维护的东西。
CREATE TABLE series (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_series_slug ON series(slug);

ALTER TABLE posts ADD COLUMN series_id TEXT;

CREATE INDEX idx_posts_series ON posts(series_id, published_at);
