import type { Locale } from "../types";

/**
 * 品牌常量：仓库、许可证、默认站点名。
 * 站点可配置项（站名/签名/作者）都在 D1 的 `site` 表里，这里只放**不可变**的东西。
 */
/**
 * 静态资源（styles.css / app.js / admin.js / export-zip.js）的缓存版本号。
 * 改了这些文件就把数字 +1 —— 浏览器与边缘才会立刻换新，否则可能继续命中旧缓存。
 */
export const ASSET_VERSION = "9";

export const BRAND = {
  repo: "onblog/miao-blog",
  repoUrl: "https://github.com/onblog/miao-blog",
  license: "AGPL-3.0-only",
  defaultNameZh: "猫窝博客",
  defaultNameEn: "Miao Blog",
  defaultUrl: "https://blog.wordtk.com",
} as const;

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Unix 毫秒 → 可读日期。中文用 `2026年10月22日`，英文用 `Oct 22, 2026` */
export function formatDate(ms: number | null | undefined, locale: Locale): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (locale === "zh") return `${y}年${m}月${day}日`;
  return `${MONTHS_EN[d.getUTCMonth()]} ${day}, ${y}`;
}

/** 归档分组用的年份 */
export function yearOf(ms: number): string {
  return String(new Date(ms).getUTCFullYear());
}

/** 千分位数字 */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** 粗略字数统计：中文按字、英文按词，都折算成「千字」 */
export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9_'-]+/g) ?? []).length;
  return cjk + latin;
}

/** 阅读时长：中文约 400 字/分钟，英文约 220 词/分钟，取保守值算 */
export function readingMinutes(markdown: string): number {
  const words = wordCount(markdown);
  return Math.max(1, Math.round(words / 350));
}

/** 把后台填的 GitHub 值归一成可点的 URL：`onblog` / `@onblog` / `github.com/onblog` / 完整地址都认 */
export function githubUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^github\.com\//i.test(trimmed)) return `https://${trimmed}`;
  return `https://github.com/${trimmed.replace(/^@/, "")}`;
}

/**
 * slug 生成：保留 Unicode 字母/数字（含汉字），其余转连字符。
 *
 * 只用于**标签与合集**的地址。文章地址走 `allocateNumericSlug()`（纯毫秒数字），
 * 不再由标题生成 —— 中文标题转写出来的地址长短不一，还会随标题改变。
 */
export function slugify(input: string, fallback: string): string {
  const normalized = input.normalize("NFKC").toLowerCase();
  const parts = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const slug = parts.join("-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 80) || fallback;
}

