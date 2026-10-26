import { describe, expect, it } from "vitest";

import { absolutizeMarkdown, normalizeOrigin } from "../src/lib/copy-source";

/**
 * 拷贝源码的绝对地址转换。
 *
 * 这一组用例钉死的是「贴到外站后图片和站内链接还能不能打开」：
 * 正文存的是站内相对地址（/media/...、/p/...），复制出去必须带上当前访问地址，
 * 否则微信公众号 / 掘金 / 知乎会把它们解析到自己的域名下，全部 404。
 */

const ORIGIN = "https://blog.test";

describe("拷贝源码：图片与链接绝对化", () => {
  it("Markdown 图片的相对路径变成绝对地址", () => {
    expect(absolutizeMarkdown("![图](/media/a.webp)", ORIGIN)).toBe(
      "![图](https://blog.test/media/a.webp)",
    );
  });

  it("站内链接绝对化，外链与页内锚点原样保留", () => {
    const out = absolutizeMarkdown("[文章](/p/1690000000000) [外站](https://other.test/x) [锚点](#top)", ORIGIN);
    expect(out).toContain("(https://blog.test/p/1690000000000)");
    expect(out).toContain("(https://other.test/x)");
    expect(out).toContain("(#top)");
  });

  it("协议相对地址（//cdn）不重复拼 origin", () => {
    expect(absolutizeMarkdown("![x](//cdn.test/a.png)", ORIGIN)).toBe("![x](//cdn.test/a.png)");
  });

  it("链接标题与尖括号目标都保留", () => {
    expect(absolutizeMarkdown('[文章](/p/1 "标题")', ORIGIN)).toBe(
      '[文章](https://blog.test/p/1 "标题")',
    );
    expect(absolutizeMarkdown("[文章](</p/2>)", ORIGIN)).toBe(
      "[文章](<https://blog.test/p/2>)",
    );
  });

  it("引用式定义与原生 HTML 属性同样处理", () => {
    const out = absolutizeMarkdown('[ref]: /media/b.png "标题"\n\n<img src="/media/c.png" />', ORIGIN);
    expect(out).toContain('[ref]: https://blog.test/media/b.png "标题"');
    expect(out).toContain('src="https://blog.test/media/c.png"');
  });

  it("嵌套结构（图片外面套链接）两层都可以绝对化", () => {
    const out = absolutizeMarkdown("[![图](/media/a.webp)](/p/1)", ORIGIN);
    expect(out).toBe("[![图](https://blog.test/media/a.webp)](https://blog.test/p/1)");
  });

  it("origin 末尾多余的斜杠不会拼出双斜杠", () => {
    expect(absolutizeMarkdown("![x](/media/a.png)", "https://blog.test/")).toBe(
      "![x](https://blog.test/media/a.png)",
    );
  });

  it("origin 只接受 http / https，其他协议一律拒绝", () => {
    expect(normalizeOrigin("https://blog.test/path?q=1")).toBe("https://blog.test");
    expect(normalizeOrigin("http://127.0.0.1:8789")).toBe("http://127.0.0.1:8789");
    expect(normalizeOrigin("javascript:alert(1)")).toBe(null);
    expect(normalizeOrigin("data:text/html,x")).toBe(null);
    expect(normalizeOrigin("not a url")).toBe(null);
    expect(normalizeOrigin("")).toBe(null);
  });
});
