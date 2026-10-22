import type { Locale } from "../types";

/**
 * 品牌常量：仓库、许可证、默认站点名。
 * 站点可配置项（站名/签名/作者）都在 D1 的 `site` 表里，这里只放**不可变**的东西。
 */
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

/**
 * slug 生成：保留 Unicode 字母/数字（含汉字），其余转连字符。
 *
 * 中文标题**不转拼音**：不引第三方拼音库（多 200KB+ 依赖），而中文路径在浏览器、
 * 搜索引擎与 Hono 路由里都完全可用。地址栏里显示 `猫窝的第一篇` 比 `mao-wo-de-di-yi-pian`
 * 或 `post-3f9a2c` 更好认。
 */
export function slugify(input: string, fallback: string): string {
  const normalized = input.normalize("NFKC").toLowerCase();
  const parts = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const slug = parts.join("-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 80) || fallback;
}

/** 在已有 slug 集合里保证唯一：重复时追加 `-2`、`-3`…… */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
