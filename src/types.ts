import type { Context } from "hono";

/** 语言：站点 UI 与文章都只分这两档 */
export type Locale = "zh" | "en";

/** 颜色模式：作者在后台定一个默认值，auto 表示跟随读者系统 */
export type ColorMode = "light" | "dark" | "auto";

/** 评论者身份（GitHub OAuth 换取，只存展示必需字段，不落 email） */
export type ReaderUser = {
  githubId: number;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AdminUser = {
  username: string;
  /**
   * true = 仍是出厂默认口令（admin/admin）。
   *
   * 由会话里记着、登录时写进去的：服务端据此把作者关进 /admin/account，
   * 其他后台接口与页面一律拒绝。改完密码后重新签发的会话里它是 false。
   */
  mustChange: boolean;
};

/** 后台账号记录（单行表 `admin_credentials`，见 migrations/0007）。 */
export type AdminAccount = {
  username: string;
  password_hash: string;
  salt: string;
  iterations: number;
  must_change: number;
  updated_at: number;
};

/** 挂在 c 上的请求级状态 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    reader: ReaderUser | null;
    admin: AdminUser | null;
    locale: Locale;
    colorMode: ColorMode;
    site: SiteRow;
  };
};

export type AppContext = Context<AppEnv>;

export type SeriesRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
};

export type PostRow = {
  id: string;
  series_id: string | null;
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
  series?: SeriesRow | null;
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

/**
 * 站点资料：单行表。
 * 语言由部署时的 SITE_LOCALE 决定，所以站名/签名/简介/SEO 描述都只有**一套**文案，
 * 不再有 `_zh` / `_en` 两列 —— 后台也就不会出现让人困惑的双语输入框。
 */
export type SiteRow = {
  id: number;
  /** 站点公开地址（来自部署时的 SITE_URL），用于拼 canonical / og:url 绝对地址 */
  url: string;
  name: string;
  tagline: string;
  owner_name: string;
  owner_bio: string;
  owner_avatar: string | null;
  owner_github: string | null;
  owner_email: string | null;
  owner_location: string | null;
  owner_links: string;
  color_mode: string;
  accent: string | null;
  comments_enabled: number;
  seo_description: string;
  created_at: number;
  updated_at: number;
};
