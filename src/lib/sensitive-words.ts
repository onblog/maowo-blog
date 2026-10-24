/**
 * 评论敏感词：纯函数部分（规范化、词表解析、分类）。
 *
 * 设计要点：
 * 1. **词表由管理员上传，不随仓库分发** —— 敏感词（尤其政治类）不适合进公开仓库，
 *    所以仓库里只有解析器与空表；上传入口在后台（设置页）。
 * 2. **匹配前先规范化**：去掉空白、标点、符号，英文转小写。这样「敏_感 词」这类
 *    简单变形也能命中，而正常中文写作几乎不受影响。
 * 3. 词表格式：每行一个词；`# 分类` 开头的行为分类声明，未声明的归 `other`。
 *    分类只用于后台统计与排查，判定是「命中任意一类即拦」。
 */

import type { Locale } from "../types";
import { t } from "./i18n";

/** 分类：key 落库，zh/en 给后台展示。只用于统计，判定不区分。 */
export const SENSITIVE_CATEGORIES = [
  { key: "political", zh: "政治", en: "Political" },
  { key: "porn", zh: "色情", en: "Porn" },
  { key: "religion", zh: "宗教", en: "Religion" },
  { key: "gambling", zh: "赌博", en: "Gambling" },
  { key: "drug", zh: "毒品", en: "Drug" },
  { key: "violence", zh: "暴力", en: "Violence" },
  { key: "other", zh: "其他", en: "Other" },
] as const;

export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number]["key"];

const CATEGORY_ALIASES: Record<string, SensitiveCategory> = {
  political: "political",
  政治: "political",
  porn: "porn",
  色情: "porn",
  黄: "porn",
  religion: "religion",
  宗教: "religion",
  gambling: "gambling",
  赌博: "gambling",
  赌: "gambling",
  drug: "drug",
  毒品: "drug",
  violence: "violence",
  暴力: "violence",
  暴恐: "violence",
  other: "other",
  其他: "other",
};

/** 单次上传的词数上限：D1 只有一次 `instr` 全表扫描，词太多会拖慢评论接口。 */
export const SENSITIVE_WORD_LIMIT = 5000;

/**
 * 匹配用的规范化：NFKC（全角转半角）→ 去掉空白/标点/符号 → 转小写。
 *
 * 保留汉字、字母、数字；emoji 与标点按 `\p{S}` / `\p{P}` 清掉。
 */
export function normalizeForMatch(text: string): string {
  return (text ?? "")
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

export type SensitiveWordEntry = {
  /** 规范化后的词，落库主键 */
  word: string;
  category: SensitiveCategory;
  /** 上传时的原始写法，后台展示用 */
  source: string;
};

export type ParseResult = {
  entries: SensitiveWordEntry[];
  /** 规范化后为空的词（纯标点/空白），已丢弃 */
  skipped: number;
  /** 超出上限被截断的词数 */
  truncated: number;
};

/**
 * 解析上传的词表文本。
 *
 * 格式（每行一个词）：
 * ```
 * # 政治
 * 示例词A
 * 示例词B
 * # 色情
 * 示例词C
 * ```
 *
 * - `#` 开头是分类声明，认不出分类（含 `# 注释` 这类）就忽略该行；
 * - 空行忽略；
 * - 同一个词重复出现只留第一次（主键去重）；
 * - 词与分类都做规范化，避免上传了「敏 感」却匹配不到。
 */
export function parseSensitiveWordList(raw: string): ParseResult {
  const entries: SensitiveWordEntry[] = [];
  const seen = new Set<string>();
  let current: SensitiveCategory = "other";
  let skipped = 0;
  let truncated = 0;

  for (const line of (raw ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith("#")) {
      const key = normalizeForMatch(trimmed.slice(1));
      const matched = CATEGORY_ALIASES[key];
      if (matched) current = matched;
      // 认不出的 `#` 行当作注释忽略
      continue;
    }

    const word = normalizeForMatch(trimmed);
    if (word === "") {
      skipped += 1;
      continue;
    }
    if (seen.has(word)) continue;
    if (entries.length >= SENSITIVE_WORD_LIMIT) {
      truncated += 1;
      continue;
    }
    seen.add(word);
    entries.push({ word, category: current, source: trimmed.slice(0, 64) });
  }

  return { entries, skipped, truncated };
}

/** 后台统计展示用：分类的中文名 */
export const categoryLabel = (key: string, locale: "zh" | "en"): string => {
  const found = SENSITIVE_CATEGORIES.find((category) => category.key === key);
  if (!found) return locale === "zh" ? "未分类" : "Other";
  return locale === "zh" ? found.zh : found.en;
};

/**
 * 后台展示用的摘要文案：条数 + 分类分布，空表时给「上传即启用」的引导。
 *
 * 后台评论页（SSR）与 `GET /api/admin/sensitive-words`（上传/清空后回填）用的是同一句，
 * 所以文案只在 i18n 里写一次，格式化也只在里做一次 —— 否则两边各拼一套，早晚拼出两种句子。
 */
export function sensitiveSummaryText(
  locale: Locale,
  stats: { total: number; categories: Array<{ category: string; count: number }> },
): string {
  if (stats.total === 0) return t(locale, "admin.sensitive.empty");
  return t(locale, "admin.sensitive.summary", {
    n: stats.total,
    cats: stats.categories.map((item) => `${categoryLabel(item.category, locale)} ${item.count}`).join(" · "),
  });
}
