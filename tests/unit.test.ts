import { describe, expect, it } from "vitest";

import { messages, t } from "../src/lib/i18n";
import { slugify, wordCount, readingMinutes, formatDate, githubLogin } from "../src/lib/brand";
import { excerpt, renderMarkdown, renderMarkdownWithToc } from "../src/lib/markdown";

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

  it("```mermaid 输出图卡占位，而不是代码块", () => {
    const html = renderMarkdown("```mermaid\nsequenceDiagram\n  A->>B: hi\n```");
    // 前端靠 data-mermaid + pre.mermaid 找节点；套上代码块外壳就再也不会被渲染
    expect(html).toContain('<figure class="diagram" data-mermaid>');
    expect(html).toContain('<pre class="mermaid">');
    expect(html).not.toContain("code-block__lang");
    // 源码照样转义：正文写不进可执行 HTML
    expect(renderMarkdown("```mermaid\ngraph TD\nA[\"<img src=x>\"]\n```")).not.toContain("<img src=x>");
  });
});

describe("博主身份识别", () => {
  it("从后台填的 GitHub 地址解析出 login", () => {
    expect(githubLogin("https://github.com/onblog/")).toBe("onblog");
    expect(githubLogin("https://github.com/onblog")).toBe("onblog");
    expect(githubLogin("onblog")).toBe("onblog");
    expect(githubLogin("@onblog")).toBe("onblog");
    expect(githubLogin("github.com/onblog")).toBe("onblog");
  });

  it("没填或填了空值时不产生 login（此时不显示任何博主标签）", () => {
    expect(githubLogin(null)).toBeNull();
    expect(githubLogin("")).toBeNull();
    expect(githubLogin("   ")).toBeNull();
  });
});
