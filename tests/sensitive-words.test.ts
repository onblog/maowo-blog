import { describe, expect, it } from "vitest";

import {
  SENSITIVE_WORD_LIMIT,
  categoryLabel,
  normalizeForMatch,
  parseSensitiveWordList,
} from "../src/lib/sensitive-words";

describe("normalizeForMatch", () => {
  it("去掉空白、标点与符号", () => {
    expect(normalizeForMatch("敏_感 词！")).toBe("敏感词");
    expect(normalizeForMatch("敏-感-词")).toBe("敏感词");
  });

  it("英文转小写，全角转半角（NFKC）", () => {
    expect(normalizeForMatch("ＦＵＣＫ")).toBe("fuck");
    expect(normalizeForMatch("FuCk")).toBe("fuck");
  });

  it("纯表情/标点得到空串", () => {
    expect(normalizeForMatch("🎉🎉 ~!@#")).toBe("");
  });
});

describe("parseSensitiveWordList", () => {
  it("每行一个词，默认归 other", () => {
    const parsed = parseSensitiveWordList("词A\n词B");
    expect(parsed.entries).toEqual([
      { word: "词a", category: "other", source: "词A" },
      { word: "词b", category: "other", source: "词B" },
    ]);
  });

  it("# 分类声明对后续行生效，中英文分类名都认", () => {
    const parsed = parseSensitiveWordList("# 政治\n词A\n# porn\n词B\n# 赌博\n词C");
    expect(parsed.entries.map((entry) => entry.category)).toEqual(["political", "porn", "gambling"]);
  });

  it("认不出的 # 行当注释忽略，分类保持上一个", () => {
    const parsed = parseSensitiveWordList("# 色情\n# 这是注释\n词A");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.category).toBe("porn");
  });

  it("同一个词重复出现只留第一次", () => {
    const parsed = parseSensitiveWordList("词A\n词A\n# 色情\n词A");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.category).toBe("other");
  });

  it("纯标点/空白的词被丢弃并计数", () => {
    const parsed = parseSensitiveWordList("词A\n！！！\n   ");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it("词也做规范化（上传「敏 感」与「敏感」等价）", () => {
    const parsed = parseSensitiveWordList("敏 感");
    expect(parsed.entries[0]?.word).toBe("敏感");
  });

  it("超过上限截断并报告", () => {
    const lines = Array.from({ length: SENSITIVE_WORD_LIMIT + 3 }, (_, index) => `词${index}`);
    const parsed = parseSensitiveWordList(lines.join("\n"));
    expect(parsed.entries).toHaveLength(SENSITIVE_WORD_LIMIT);
    expect(parsed.truncated).toBe(3);
  });
});

describe("categoryLabel", () => {
  it("已知分类给中英文名，未知回落", () => {
    expect(categoryLabel("porn", "zh")).toBe("色情");
    expect(categoryLabel("porn", "en")).toBe("Porn");
    expect(categoryLabel("unknown", "zh")).toBe("未分类");
  });
});
