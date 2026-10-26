/**
 * 拷贝源码（移植到其他平台）。
 *
 * 本站在正文里存的是**站内相对地址**（上传图片返回 `/media/xxx.webp`），
 * 这在自家站点上是对的：换域名、走 CDN、本地开发都不用改文章。
 * 但把它整段贴到微信公众号、掘金、知乎这类平台时，相对地址会解析到对方的域名上，
 * 图片与站内链接全部失效 —— 所以「拷贝」不是原样复制，而是**按需绝对化**。
 *
 * 绝对化的 origin 由浏览器在上传时给出（`window.location.origin`），
 * 而不是服务端的 SITE_URL：作者在本地写作时，选中的就是本地地址，
 * 复制出去的地址与当时看到的页面完全一致，不会有「本地文章抄进生产域名」的意外。
 *
 * 存储里的正文**永远不被改写**：绝对化只发生在这一次拷贝的返回值里。
 */

/**
 * 规范化 origin。
 *
 * 只接受 http / https：`javascript:`、`data:` 这类协议拼进 Markdown 就是注入。
 * 用 `URL.origin` 而不是字符串截断，`https://a.com/path` 会得到 `https://a.com`。
 */
export function normalizeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** 根相对地址 → 绝对地址；已可解析的地址（外链、锚点、协议相对）原样返回 */
function absolutize(dest: string, origin: string): string {
  if (!dest.startsWith("/") || dest.startsWith("//")) return dest;
  return `${origin}${dest}`;
}

/**
 * 把 Markdown 源码里的根相对地址改成绝对地址。
 *
 * 覆盖四种写法，都是线上正文里真实存在的：
 *   1. 行内链接 / 图片：`[文章](/p/1690000000000)`、`![图](/media/x.webp)`
 *   2. 引用式定义：`[ref]: /media/x.webp "标题"`
 *   3. 原生 HTML 属性：`<img src="/media/x.webp">`（渲染器不开 html，但源码会原样带走）
 *   4. 尖括号包裹的目标：`[文章](</p/1>)`
 *
 * 不碰外链、`#锚点` 与 `//cdn.example.com`：
 * 前两者本来就正确，后者加 origin 会拼出 `https://blog.test//cdn...`。
 */
export function absolutizeMarkdown(source: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");

  // 行内链接与图片：目标紧跟在 `](` 之后。`[^)\s>]*` 保证标题（"..."）与括号结构不被吞掉。
  const inline = source.replace(
    /\]\(\s*(<)?(\/[^)\s>]*)(>)?/g,
    (match, open: string | undefined, dest: string, close: string | undefined) => {
      const next = absolutize(dest, base);
      if (next === dest) return match;
      return `](${open ?? ""}${next}${close ?? ""}`;
    },
  );

  // 引用式定义：[id]: /media/x.webp "标题"
  const defined = inline.replace(
    /^(\s{0,3}\[[^\]\n]+\]:[ \t]*)(<)?(\/[^\s>]*)(>)?/gm,
    (match, head: string, open: string | undefined, dest: string, close: string | undefined) => {
      const next = absolutize(dest, base);
      if (next === dest) return match;
      return `${head}${open ?? ""}${next}${close ?? ""}`;
    },
  );

  // 原生 HTML 的 src / href
  return defined.replace(
    /(\s(?:src|href)=["'])(\/[^"']*)(["'])/gi,
    (match, head: string, dest: string, tail: string) => {
      const next = absolutize(dest, base);
      if (next === dest) return match;
      return `${head}${next}${tail}`;
    },
  );
}
