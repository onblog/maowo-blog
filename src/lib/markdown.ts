import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import django from "highlight.js/lib/languages/django";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import properties from "highlight.js/lib/languages/properties";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import MarkdownIt from "markdown-it";

/**
 * Markdown 渲染。
 * `html: false` 是关键安全决策：正文里写不出原生 HTML，因此**不需要额外的 sanitizer**，
 * 从根上消除存储型 XSS。要富交互就走受控的短代码（后续按需加）。
 *
 * 语法高亮**服务端**做（highlight.js）：预览接口与文章页共用这一个渲染器，
 * 所以"预览 = 线上"这条不变量在高亮上也成立 —— 客户端高亮做不到这点。
 * 只注册用得到的语言：全量 highlight.js 有 190+ 种语法、近 1MB，
 * 而这里 24 种覆盖了技术博客绝大多数代码块。
 *
 * ⚠️ 注册清单必须跟着**线上实际的围栏语言**走：`java` 曾经漏注册，
 * 结果 2000+ 个 ```java 代码块全部退化成裸 `<pre><code>`（没有头部条、没有高亮）。
 * 判断某个语言有没有注册，看 `hljs.getLanguage(name)` 即可 —— 渲染器用的就是它。
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
});

for (const [name, language] of [
  ["javascript", javascript],
  ["typescript", typescript],
  ["json", json],
  ["bash", bash],
  ["sql", sql],
  ["yaml", yaml],
  ["css", css],
  ["xml", xml],
  ["markdown", markdown],
  ["dockerfile", dockerfile],
  ["python", python],
  ["go", go],
  ["rust", rust],
  ["ini", ini],
  ["diff", diff],
  /*
   * 以下按"线上围栏出现次数"补注册（统计自全站正文）：
   * java 数千、lua / properties / cql / nginx / c / php 数十。漏一个就是整批文章失去高亮。
   */
  ["java", java],
  ["lua", lua],
  ["properties", properties],
  ["nginx", nginx],
  ["c", c],
  ["php", php],
  /*
   * `cql`（Neo4j Cypher）没有专门语法，借 SQL 的语法高亮 —— `CREATE` / `MATCH` / `WHERE`
   * 这些关键字本来就是同一套。单独注册这个名字，头部条才能显示 CQL 而不是 SQL。
   */
  ["cql", sql],
  /*
   * `liquid` 没有专门语法，借 Django 模板的语法（`{{ }}` / `{% %}` / HTML 混排几乎一致），
   * 用 `liquid` 这个名字注册，头部条才能显示正确的语言名。
   */
  ["liquid", django],
  /*
   * 纯文本：控制台输出、日志、目录树这类"没有语法可高亮"的块。
   * 注册它是为了**拿到头部条与代码块外壳**（不加高亮 token，内容原样转义），
   * 而不是让它们继续退化成裸 `<pre><code>` —— 视觉上与其它代码块保持一致。
   */
  ["plaintext", plaintext],
] as const) {
  hljs.registerLanguage(name, language);
}

/** 别名：写 ```js 的人不会愿意被要求改成 ```javascript */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  html: "xml",
  vue: "xml",
  xaml: "xml",
  yml: "yaml",
  md: "markdown",
  docker: "dockerfile",
  py: "python",
  python3: "python",
  golang: "go",
  rs: "rust",
  toml: "ini",
  conf: "ini",
  patch: "diff",
  props: "properties",
  nginxconf: "nginx",
  h: "c",
  liquid: "liquid",
  django: "liquid",
  twig: "liquid",
  text: "plaintext",
  txt: "plaintext",
  log: "plaintext",
  plain: "plaintext",
  output: "plaintext",
};

/** 头部条上显示的名字：写 `js` 的人想看的是 `JavaScript` */
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  bash: "Shell",
  sql: "SQL",
  yaml: "YAML",
  css: "CSS",
  xml: "HTML / XML",
  markdown: "Markdown",
  dockerfile: "Dockerfile",
  python: "Python",
  go: "Go",
  rust: "Rust",
  ini: "TOML / INI",
  diff: "Diff",
  java: "Java",
  lua: "Lua",
  properties: "Properties",
  nginx: "Nginx",
  c: "C",
  php: "PHP",
  cql: "CQL",
  liquid: "Liquid",
  plaintext: "Text",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 代码块渲染：高亮 + 一条带头部（语言名）的容器。
 *
 * 为什么要头部条：代码块在浅色主题下是一块深色（设计系统规定 `surface-code` 就是深色，
 * 不是"深色主题专属"），没有头部时它看着像一段被压暗的正文，
 * 有了语言名才能一眼确认"这是 SQL，不是日志"。
 *
 * 未注册的语言（或没写语言）**不猜**：原样转义输出，也不给头部条 ——
 * 猜错语言的高亮比不高亮更让人困惑。
 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  if (!token) return "";

  const info = (token.info ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const language = LANGUAGE_ALIASES[info] ?? info;
  /*
   * 去掉**结尾那一个换行**：围栏语法的 `content` 一定带着源码里
   * "最后一行 + 换行"，直接渲染会在代码块底部多出一整行空白（14px × 1.6 ≈ 22px）。
   * 那行空白比顶部内边距还高，于是"上下留白不对称"，水平滚动条也被推到底部很远处。
   * 只去一个：代码本身末尾的空行是作者有意留的，不该替他删干净。
   */
  const source = token.content.endsWith("\n") ? token.content.slice(0, -1) : token.content;

  /*
   * Mermaid 图（```mermaid）。**渲染在浏览器里**：mermaid 要量文字宽度、量节点尺寸，
   * 依赖真实 DOM，Workers 里没有。这里只输出占位 —— `<pre class="mermaid">` 正是
   * mermaid 官方接受的输入节点，前端按需加载库后直接 `mermaid.run`。
   *
   * 刻意不套代码块外壳：图不是代码，头部条上的语言名对它没有意义。
   * 渲染前 pre 显示源码（无 JS 时的降级），渲染成功后前端给容器加 `diagram--ready`，
   * 由 CSS 换成图卡样式（见 public/styles.css 的 `.diagram`）。
   *
   * 源码照旧走 escapeHtml：正文里写不进可执行 HTML，这个不变量不因新增短代码而破；
   * mermaid 自己再以 securityLevel: "strict" 渲染（见 public/app.js）。
   */
  if (language === "mermaid") {
    return `<figure class="diagram" data-mermaid><pre class="mermaid">${escapeHtml(source)}</pre></figure>\n`;
  }

  const known = language && hljs.getLanguage(language) ? language : "";
  const body = known
    ? hljs.highlight(source, { language: known, ignoreIllegals: true }).value
    : escapeHtml(source);

  if (!known) return `<pre><code>${body}</code></pre>\n`;

  const label = LANGUAGE_LABELS[known] ?? known;
  return (
    `<div class="code-block">` +
    `<div class="code-block__head"><span class="code-block__lang">${escapeHtml(label)}</span></div>` +
    `<pre class="code-block__pre"><code class="hljs language-${escapeHtml(known)}">${body}</code></pre>` +
    `</div>\n`
  );
};

// 用户内容里的外链统一加 rel，避免 SEO 权重外流与 window.opener 风险
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]?.attrSet("rel", "nofollow ugc noopener");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/**
 * 正文图片懒加载。
 *
 * 长文里几十张图，若全部按默认行为立即加载，首屏会同时发起几十个请求 ——
 * 带宽被图片占满，正文自身的渲染反而被拖慢（图在床上，字在等）。
 * `loading="lazy"` 把「屏幕外的图」推迟到快滚到时再取。
 *
 * 为什么可以无脑对所有正文图加，而不用把第一张排除掉以保护 LCP：
 * 浏览器对 `loading="lazy"` 用的是**提前量阈值**（Chrome 是视口外 1250px / 慢速网络 2500px），
 * 落在阈值内的图仍然立即加载。文章首屏本来就只有文字头部，
 * 即便某篇文章以图开头，它也在这段阈值之内，不会真的等到"滚到才加载"。
 *
 * 用 attrSet 而不是改 renderer 的默认实现：默认实现还要负责把图片的 alt 从内联子节点
 * 里取出来（`![说明](url)` 的"说明"在 children 上，不在 attrs 上），照抄一遍会漏掉这一步。
 * `decoding="async"` 顺带避免解码阻塞渲染 —— 它没有阈值语义，纯收益。
 */
const defaultImage =
  md.renderer.rules.image ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx]?.attrSet("loading", "lazy");
  tokens[idx]?.attrSet("decoding", "async");
  return defaultImage(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}

/** 表格分隔行（`| --- | :--: |`，也兼容省略首尾竖线的写法） */
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;

/**
 * 摘要是**纯文本**，表格塞进来只会变成一堆 `|` 和 `---`（列表卡片里非常难看），
 * 所以整行丢掉 —— 卡片只负责给个开头，细节留给正文。
 */
function isTableLine(line: string): boolean {
  if (TABLE_SEPARATOR.test(line)) return true;
  if (line.trim().startsWith("|")) return true;
  return (line.match(/\|/g) ?? []).length >= 2;
}

/** 从 Markdown 抽取纯文本摘要（列表卡片用），不渲染 HTML */
export function excerpt(source: string, max = 140): string {
  const stripped = source
    // 代码块整块丢掉；行内代码保留文字 —— 中文文章里的 `D1`、`EXPLAIN` 往往是关键词
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  const text = stripped
    .split("\n")
    .filter((line) => !isTableLine(line))
    // 正文开头的一级标题常与文章标题重复，摘要里不应该再出现一次
    .filter((line) => !/^[ \t]{0,3}#[ \t]+/.test(line))
    .join("\n")
    // 注意用 [ \t] 而不是 \s：\s 会连换行一起吃掉，段与段之间的空行就消失了
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    // 列表项与段落之间要有可见分隔，否则摘要把多条内容粘成一句
    .replace(/^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+/gm, "· ")
    .replace(/\n{2,}/g, " · ")
    .replace(/\n/g, " ")
    .replace(/[*_~]/g, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/^·\s*/, "")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export type TocItem = { level: 2 | 3; id: string; text: string };

/** 标题 → 锚点 id：中英文都保留（浏览器能正确处理中文 fragment） */
function headingId(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * 渲染正文并抽出右侧目录。
 *
 * 用**渲染后处理**（正则注入 id）而不是改 markdown-it 的 renderer 规则：
 * renderer 规则是挂在共享实例上的，而目录必须在每次调用内独立收集 ——
 * 同一个 isolate 里并发处理多个请求时，共享状态会互相污染。
 */
export function renderMarkdownWithToc(source: string): { html: string; toc: TocItem[] } {
  const rendered = renderMarkdown(source);
  const toc: TocItem[] = [];
  const used = new Set<string>();

  const html = rendered.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (match, levelRaw: string, inner: string) => {
    const level = Number(levelRaw) === 3 ? 3 : 2;
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!text) return match;

    const base = headingId(text) || `section-${toc.length + 1}`;
    let id = base;
    for (let i = 2; used.has(id); i += 1) id = `${base}-${i}`;
    used.add(id);

    toc.push({ level, id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  return { html, toc };
}
