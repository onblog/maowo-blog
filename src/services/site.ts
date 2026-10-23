import type { SiteRow } from "../types";

/**
 * 站点资料：单行表（id 恒为 1）。
 * 首次读取时如果行不存在（例如迁移没跑），回退到内置默认值，页面不会崩。
 */
const FALLBACK: SiteRow = {
  id: 1,
  url: "",
  name: "猫窝博客",
  tagline: "一个安静写东西的地方",
  owner_name: "Miao",
  owner_bio: "",
  owner_avatar: null,
  owner_github: null,
  owner_email: null,
  owner_location: null,
  owner_links: "[]",
  color_mode: "auto",
  accent: null,
  comments_enabled: 1,
  seo_description: "",
  created_at: 0,
  updated_at: 0,
};

export async function getSite(env: Env): Promise<SiteRow> {
  // 公开地址不进数据库：它由部署时的 SITE_URL 决定，改了数据库也不该变。
  const url = env.SITE_URL.replace(/\/$/, "");
  try {
    const row = await env.DB.prepare("SELECT * FROM site WHERE id = 1").first<SiteRow>();
    return { ...(row ?? FALLBACK), url };
  } catch {
    return { ...FALLBACK, url };
  }
}

const EDITABLE = [
  "name",
  "tagline",
  "owner_name",
  "owner_bio",
  "owner_avatar",
  "owner_github",
  "owner_email",
  "owner_location",
  "owner_links",
  "color_mode",
  "accent",
  "comments_enabled",
  "seo_description",
] as const;

export type SitePatch = Partial<Pick<SiteRow, (typeof EDITABLE)[number]>>;

export async function updateSite(env: Env, patch: SitePatch): Promise<SiteRow> {
  const keys = EDITABLE.filter((key) => patch[key] !== undefined);
  if (keys.length === 0) return getSite(env);

  const sets = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => patch[key] as string | number | null);
  await env.DB.prepare(
    `UPDATE site SET ${sets}, updated_at = ? WHERE id = 1`,
  )
    .bind(...values, Date.now())
    .run();
  return getSite(env);
}

/**
 * 友情链接：站点名 + 一句话简介 + 头像（都可空）+ 链接。
 * 兼容旧数据（那时候只有 label_zh / label_en 两个字段）。
 */
export type FriendLink = {
  name: string;
  desc: string;
  avatar: string;
  url: string;
};

export function parseLinks(raw: string): FriendLink[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === "string")
      .map((item) => ({
        name: String(item.name ?? item.label_zh ?? item.label_en ?? "link").slice(0, 30),
        desc: String(item.desc ?? "").slice(0, 80),
        avatar: String(item.avatar ?? item.icon ?? ""),
        url: String(item.url),
      }))
      .slice(0, 24);
  } catch {
    return [];
  }
}
