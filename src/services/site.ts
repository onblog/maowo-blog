import type { SiteRow } from "../types";

/**
 * 站点资料：单行表（id 恒为 1）。
 * 首次读取时如果行不存在（例如迁移没跑），回退到内置默认值，页面不会崩。
 */
const FALLBACK: SiteRow = {
  id: 1,
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
  try {
    const row = await env.DB.prepare("SELECT * FROM site WHERE id = 1").first<SiteRow>();
    return row ?? FALLBACK;
  } catch {
    return FALLBACK;
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

/** owner_links 是 JSON 字符串，解析失败时当作空数组（不因脏数据把页面打挂） */
export function parseLinks(raw: string): Array<{ label_zh: string; label_en: string; url: string }> {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === "string")
      .map((item) => ({
        label_zh: String(item.label_zh ?? item.label_en ?? "link"),
        label_en: String(item.label_en ?? item.label_zh ?? "link"),
        url: String(item.url),
      }))
      .slice(0, 12);
  } catch {
    return [];
  }
}
