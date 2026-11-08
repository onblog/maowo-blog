-- 评论按时间维度的查询此前没有可用索引前缀：
--   * countToday：SELECT COUNT(*) FROM comments WHERE created_at >= ?
--   * listAll：  SELECT ... FROM comments ORDER BY created_at DESC LIMIT ?
-- EXPLAIN QUERY PLAN 显示为 `SCAN comments USING COVERING INDEX idx_comments_post`，
-- 也就是为了按时间过滤，把整张评论表当索引扫了一遍。
--
-- 评论表当前是空表，所以线上还没体现出成本；一旦有评论，这两条查询会随表线性变慢。
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
