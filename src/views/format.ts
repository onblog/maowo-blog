import type { Locale } from "../types";
import { formatDate as baseFormatDate } from "../lib/brand";

export { formatNumber, yearOf, wordCount, readingMinutes } from "../lib/brand";

/** 首页/标签页共用的「N 篇」统计文案 */
export function countLabel(locale: Locale, n: number): string {
  return locale === "zh" ? `${n} 篇` : `${n} posts`;
}

export function readingTimeLabel(locale: Locale, minutes: number): string {
  return locale === "zh" ? `${minutes} 分钟阅读` : `${minutes} min read`;
}

export function formatDate(ms: number | null | undefined, locale: Locale): string {
  return baseFormatDate(ms, locale);
}

/** datetime 属性统一用 ISO，`<time>` 的语义值 */
export function isoDate(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toISOString();
}
