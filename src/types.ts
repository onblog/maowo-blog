import type { Context } from "hono";

/** 语言：站点 UI 与文章都只分这两档 */
export type Locale = "zh" | "en";

/** 主题：cute = 默认的猫窝风格；minimal = 给技术博主的极简模式 */
export type ThemeName = "cute" | "minimal";

/** 评论者身份（GitHub OAuth 换取，只存展示必需字段，不落 email） */
export type ReaderUser = {
  githubId: number;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AdminUser = {
  username: string;
};

/** 挂在 c 上的请求级状态 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    reader: ReaderUser | null;
    admin: AdminUser | null;
    locale: Locale;
    theme: ThemeName;
    site: SiteRow;
  };
};

export type AppContext = Context<AppEnv>;

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  content_md: string;
  excerpt: string | null;
  cover_image: string | null;
  cover_alt: string | null;
  lang: Locale;
  status: "draft" | "published";
  pinned: number;
  views: number;
  reading_minutes: number;
  published_at: number | null;
  created_at: number;
  updated_at: number;
};

export type PostSummary = PostRow & {
  tags: TagRow[];
};

export type TagRow = {
  id: string;
  slug: string;
  name: string;
  post_count?: number;
};

export type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  root_id: string | null;
  github_id: number;
  login: string;
  display_name: string | null;
  avatar_url: string | null;
  website: string | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  created_at: number;
  updated_at: number;
};

/** 评论树节点（视图层用） */
export type CommentNode = CommentRow & {
  children: CommentNode[];
};

export type SiteRow = {
  id: number;
  name_zh: string;
  name_en: string;
  tagline_zh: string;
  tagline_en: string;
  owner_name: string;
  owner_bio_zh: string;
  owner_bio_en: string;
  owner_avatar: string | null;
  owner_github: string | null;
  owner_email: string | null;
  owner_location: string | null;
  owner_links: string;
  default_locale: string;
  theme: string;
  accent: string | null;
  comments_enabled: number;
  seo_description_zh: string;
  seo_description_en: string;
  created_at: number;
  updated_at: number;
};
