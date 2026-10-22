import { describe, expect, it } from "vitest";

import { messages, t } from "../src/lib/i18n";
import { slugify, uniqueSlug, wordCount, readingMinutes, formatDate } from "../src/lib/brand";
import { excerpt, renderMarkdown, renderMarkdownWithToc } from "../src/lib/markdown";
import { detectLang, parseFrontMatter, parseMarkdownFile, parsePlain } from "../src/services/importer";

describe("i18n", () => {
  it("中英文键集合完全一致（新增文案必须两份都写）", () => {
    const zh = Object.keys(messages.zh).sort();
    const en = Object.keys(messages.en).sort();
    expect(en).toEqual(zh);
  });

  it("插值替换占位符", () => {
    expect(t("zh", "post.reading_time", { n: 5 })).toBe("5 分钟阅读");
    expect(t("en", "post.reading_time", { n: 5 })).toBe("5 min read");
  });

  it("缺失的占位保持原样（便于发现漏参数）", () => {
    expect(t("zh", "comments.reply_placeholder")).toContain("{name}");
  });
});

describe("slug", () => {
  it("中文标题保留汉字", () => {
    expect(slugify("猫窝的第一篇文章", "fallback")).toBe("猫窝的第一篇文章");
  });

  it("英文标题转连字符", () => {
    expect(slugify("Hello, World! 2026", "f")).toBe("hello-world-2026");
  });

  it("冲突时追加序号", () => {
    const taken = new Set(["blog", "blog-2"]);
    expect(uniqueSlug("blog", taken)).toBe("blog-3");
    expect(uniqueSlug("new", taken)).toBe("new");
  });

  it("空标题回退", () => {
    expect(slugify("!!!", "post-abc")).toBe("post-abc");
  });
});

describe("字数与阅读时长", () => {
  it("统计中英文混排", () => {
    expect(wordCount("你好世界 hello world")).toBe(6);
  });

  it("阅读时长至少 1 分钟", () => {
    expect(readingMinutes("短")).toBe(1);
  });

  it("中文日期格式", () => {
    expect(formatDate(Date.UTC(2026, 9, 22), "zh")).toBe("2026年10月22日");
    expect(formatDate(Date.UTC(2026, 9, 22), "en")).toBe("Oct 22, 2026");
  });
});

describe("Markdown 渲染", () => {
  it("关闭原生 HTML：正文写不出脚本", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
  });

  it("代码块带语言头部条", () => {
    const html = renderMarkdown("```js\nconsole.log(1)\n```");
    expect(html).toContain("code-block__lang");
    expect(html).toContain("JavaScript");
  });

  it("外链加 rel 防权重外流", () => {
    const html = renderMarkdown("[x](https://example.com)");
    expect(html).toContain("nofollow");
  });

  it("TOC 只收 h2/h3 并生成锚点", () => {
    const { toc, html } = renderMarkdownWithToc("## 一级\n\n### 二级\n");
    expect(toc.map((item) => item.text)).toEqual(["一级", "二级"]);
    expect(html).toContain('id="一级"');
  });

  it("摘要剔掉代码块与表格", () => {
    const text = excerpt("开头\n\n```js\nconst a=1\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |");
    expect(text).toContain("开头");
    expect(text).not.toContain("const a");
    expect(text).not.toContain("|");
  });
});

describe("导入解析", () => {
  it("解析标准 front-matter", () => {
    const { data, body } = parseFrontMatter("---\ntitle: 标题\ntags: [a, b]\ndate: 2024-01-02\n---\n正文");
    expect(data.title).toBe("标题");
    expect(data.tags).toBe("[a, b]");
    expect(data.date).toBe("2024-01-02");
    expect(body).toBe("正文");
  });

  it("解析多行数组标签", () => {
    const { data } = parseFrontMatter("---\ntags:\n  - 随笔\n  - 技术\n---\n正文");
    expect(data.tags).toBe("随笔, 技术");
  });

  it("标题回退到一级标题", () => {
    const post = parseMarkdownFile("2024-01-01-hello.md", "# 你好世界\n\n正文内容");
    expect(post?.title).toBe("你好世界");
    expect(post?.content.trim()).toBe("正文内容");
  });

  it("draft: true 视为草稿", () => {
    const post = parseMarkdownFile("a.md", "---\ntitle: A\ndraft: true\n---\n正文");
    expect(post?.draft).toBe(true);
  });

  it("语言检测：中文正文判为 zh，英文判为 en", () => {
    expect(detectLang("这是一段中文内容，用来判断语言归属")).toBe("zh");
    expect(detectLang("This is an English paragraph about workers.")).toBe("en");
  });

  it("纯文本模式可以切出多篇", () => {
    const posts = parsePlain("---\ntitle: 一\n---\n正文一\n---\ntitle: 二\n---\n正文二");
    expect(posts.length).toBeGreaterThanOrEqual(2);
  });
});
