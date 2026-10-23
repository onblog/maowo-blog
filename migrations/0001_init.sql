-- ============================================================================
-- maowo-blog 初始 schema
-- 定位：单作者博客。作者身份来自环境变量（/admin 登录），不建 users 表；
--       评论者身份来自 GitHub OAuth，冗余存在 comments 行上（不建评论者账号体系）。
-- 时间统一 Unix 毫秒 INTEGER；主键用 ULID 文本（时间有序）。
-- ============================================================================

-- 站点与作者资料：单行表（id 恒为 1）
CREATE TABLE site (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  tagline_zh TEXT NOT NULL DEFAULT '',
  tagline_en TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  owner_bio_zh TEXT NOT NULL DEFAULT '',
  owner_bio_en TEXT NOT NULL DEFAULT '',
  owner_avatar TEXT,
  owner_github TEXT,
  owner_email TEXT,
  owner_location TEXT,
  -- 侧栏/关于页的友情链接：[{ "label_zh": "", "label_en": "", "url": "" }]
  owner_links TEXT NOT NULL DEFAULT '[]',
  default_locale TEXT NOT NULL DEFAULT 'zh',
  theme TEXT NOT NULL DEFAULT 'cute',
  -- 自定义强调色（留空则用主题默认值）
  accent TEXT,
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  seo_description_zh TEXT NOT NULL DEFAULT '',
  seo_description_en TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO site (id, name_zh, name_en, owner_name, created_at, updated_at)
VALUES (1, '猫窝博客', 'Maowo Blog', 'Miao', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  cover_image TEXT,
  cover_alt TEXT,
  lang TEXT NOT NULL DEFAULT 'zh',
  -- draft | published
  status TEXT NOT NULL DEFAULT 'draft',
  pinned INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_feed ON posts(status, published_at DESC);
CREATE INDEX idx_posts_lang ON posts(lang, status, published_at DESC);
CREATE INDEX idx_posts_pinned ON posts(pinned, published_at DESC);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_tags_slug ON tags(slug);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX idx_post_tags_tag ON post_tags(tag_id);

-- 评论：树形用 root_id（顶层评论的 id）+ parent_id（直接父级，用于 @回复）
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  parent_id TEXT,
  root_id TEXT,
  github_id INTEGER NOT NULL,
  login TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  -- 评论者自己的博客地址（独立博客圈的互访文化）
  website TEXT,
  body TEXT NOT NULL,
  -- visible | hidden | deleted
  status TEXT NOT NULL DEFAULT 'visible',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_comments_post ON comments(post_id, status, created_at);
CREATE INDEX idx_comments_github ON comments(github_id);

-- 会话：kind = 'reader'（GitHub 评论者）| 'admin'（后台）
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- 迁移导入记录
CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
