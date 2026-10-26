import { describe, expect, it } from "vitest";

import { htmlToText, renderWechatArticle } from "../src/lib/wechat-html";

/**
 * 公众号富文本。
 *
 * 这一组用例钉死的是「粘进公众号之后还剩下什么」：
 *   · 不能有 class / id / data-*（公众号会全部剥掉）；
 *   · 每个标签必须自带 style（没有 style 就等于没有样式）；
 *   · 代码高亮要从 class 展开成 span 的颜色；
 *   · 外链必须折叠成文末脚注，否则粘贴后 URL 直接消失。
 */

const ORIGIN = "https://blog.test";

const ARTICLE = `## 标题

正文 **加粗** 与 [外链](https://example.com/a) 和 [站内](/p/1)。

> 引用

- 列表项

~~~js
const answer = 42;
~~~

![图](/media/a.webp)

| 列 | 值 |
| --- | --- |
| 一 | 二 |
`;

function render(source = ARTICLE, origin: string | null = ORIGIN, locale: "zh" | "en" = "zh") {
  return renderWechatArticle(source, origin, locale);
}

describe("公众号富文本：抗清洗", () => {
  it("输出里没有 class / id / data-*，每个标签自带内联样式", () => {
    const { html } = render();
    expect(html).not.toContain("class=");
    expect(html).not.toContain("id=");
    expect(html).not.toContain("data-");
    expect(html).toContain('<h2 style="');
    expect(html).toContain('<p style="');
    expect(html).toContain("border-left:4px solid #e8836b");
  });

  it("不会出现重复的 style 属性", () => {
    const { html } = render();
    expect(html).not.toMatch(/style="[^"]*"\s+style=/);
  });

  it("图片用绝对地址 + max-width，不写死像素宽度", () => {
    const { html } = render();
    expect(html).toContain('src="https://blog.test/media/a.webp"');
    expect(html).toContain("max-width:100%");
    expect(html).not.toContain("loading=");
    expect(html).not.toContain("decoding=");
  });

  it("表格与引用块都带内联样式", () => {
    const { html } = render();
    expect(html).toContain('<table style="');
    expect(html).toContain('<th style="');
    expect(html).toContain('<td style="');
    expect(html).toContain('<blockquote style="');
  });

  it("对齐表格的 text-align 会和边框/内边距合并，而不是把后者顶掉", () => {
    const { html } = render("| 左 | 右 |\n|:--|--:|\n| 1 | 2 |");
    expect(html).toContain("text-align:right");
    expect(html).toMatch(/<td style="[^"]*padding:9px 12px[^"]*text-align:right/);
  });
});

describe("公众号富文本：代码块", () => {
  it("拆掉站点外壳，语言名保留，代码可换行", () => {
    const { html } = render();
    expect(html).toContain("JavaScript");
    expect(html).toContain("white-space:pre-wrap");
    expect(html).not.toContain("code-block");
    expect(html).not.toContain("data-copy-code");
  });

  it("高亮 class 展开成内联颜色", () => {
    const { html } = render();
    expect(html).toContain("color:#f0a6a6"); // 关键字
    expect(html).not.toContain("hljs-");
  });

  it("未注册语言的裸代码块也会套上代码壳", () => {
    const { html } = render("~~~nosuchlang\nplain text\n~~~");
    expect(html).toContain("background:#2b2a2e");
    expect(html).not.toContain("<pre><code>");
  });
});

describe("公众号富文本：链接与脚注", () => {
  it("外链与站内链接折叠成脚注，URL 保留在文末", () => {
    const { html } = render();
    expect(html).toContain("[1]");
    expect(html).toContain("[2]");
    expect(html).toContain("https://example.com/a");
    expect(html).toContain("https://blog.test/p/1");
    expect(html).toContain("参考链接");
    // 正文里不再保留普通 <a>
    expect(html).not.toContain('href="https://example.com/a"');
  });

  it("同一地址只占一个脚注编号", () => {
    const { html } = render("[a](https://example.com/x) 与 [b](https://example.com/x)");
    expect(html).toContain("[1]");
    expect(html).not.toContain("[2]");
    // URL 只在脚注里出现一次
    expect(html.match(/https:\/\/example\.com\/x/g)?.length).toBe(1);
  });

  it("页内锚点只保留文字，不占脚注", () => {
    const { html } = render("[锚点](#section)");
    expect(html).toContain("锚点");
    expect(html).not.toContain("[1]");
  });

  it("公众号自家链接保留为可点的 <a>", () => {
    const { html } = render("[原文](https://mp.weixin.qq.com/s/abc)");
    expect(html).toContain('<a href="https://mp.weixin.qq.com/s/abc"');
    expect(html).not.toContain("[1]");
  });

  it("英文站点的脚注标题跟着语言走", () => {
    const { html } = render("[a](https://example.com/x)", ORIGIN, "en");
    expect(html).toContain("Links");
    expect(html).not.toContain("参考链接");
  });
});

describe("公众号富文本：Mermaid 与纯文本", () => {
  it("Mermaid 渲染不了，保留源码与提示", () => {
    const { html } = render("~~~mermaid\ngraph TD\nA-->B\n~~~");
    expect(html).toContain("公众号不支持 Mermaid");
    expect(html).toContain("graph TD");
    expect(html).not.toContain("data-mermaid");
  });

  it("已经是绝对地址的正文不会被二次拼接", () => {
    const { html } = renderWechatArticle("![图](https://blog.test/media/a.png)", null, "zh");
    expect(html).toContain("https://blog.test/media/a.png");
    expect(html).not.toContain("https://blog.test/https://");
  });

  it("text/plain 兜底是干净的纯文本", () => {
    const text = htmlToText('<p>你好</p><p><img src="x" alt="封面"></p>');
    expect(text).toContain("你好");
    expect(text).toContain("[图片：封面]");
    expect(text).not.toContain("<");
  });

  it("整篇文章的纯文本不夹带标签", () => {
    const { text } = render();
    expect(text).toContain("标题");
    expect(text).toContain("const answer = 42;");
    expect(text).not.toContain("<");
  });
});
