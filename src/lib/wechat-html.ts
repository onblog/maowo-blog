import { absolutizeMarkdown } from "./copy-source";
import { t } from "./i18n";
import { renderMarkdown } from "./markdown";
import type { Locale } from "../types";

/**
 * 微信富文本（公众号）。
 *
 * 公众号编辑器对粘贴内容做了三层清洗：
 *   1. 丢掉 class / id 与外部样式表，只认元素上的 style；
 *   2. 非 mp.weixin.qq.com 的外链降级成不可点的文字；
 *   3. 部分 SVG / 自定义标签会被剥掉。
 *
 * 所以这里不返回「浏览器里的 HTML」，而是一份**天生抗清洗**的产物：
 * 每个标签自带内联样式、没有 class、外链折叠成文末脚注、代码高亮展开成 span 颜色。
 * 存储里的正文完全不改 —— 这份 HTML 只活在一次复制里。
 *
 * 只做一套主题：暖橙强调色 + 深色代码块，和站点的设计 token 对齐。
 * 公众号正文列宽 677px，图片统一 max-width:100%，不写死像素宽度。
 */

const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const FONT_MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

const ACCENT = "#e8836b";
const INK = "#3f3b36";
const INK_STRONG = "#1f1c18";
const MUTED = "#948b7d";
const HAIRLINE = "#e8dfd2";
const SOFT = "#faf6f0";
const CODE_BG = "#2b2a2e";
const CODE_INK = "#ece9e4";

const ROOT = `font-family:${FONT_SANS};font-size:16px;line-height:1.8;color:${INK};letter-spacing:0.5px;word-break:break-word;`;

/** 普通标签的样式表。键是小写标签名，值是完整的 style 内容。 */
const TAG_STYLES: Record<string, string> = {
  h1: `margin:36px 0 18px;font-size:24px;line-height:1.45;font-weight:700;color:${INK_STRONG};`,
  // h2 用左侧色条，是公众号里最稳的分节方式：不用伪元素、不用背景图
  h2: `margin:34px 0 16px;padding-left:12px;border-left:4px solid ${ACCENT};font-size:21px;line-height:1.5;font-weight:700;color:${INK_STRONG};`,
  h3: `margin:28px 0 12px;font-size:18px;line-height:1.55;font-weight:700;color:${INK_STRONG};`,
  h4: `margin:24px 0 10px;font-size:16px;line-height:1.6;font-weight:700;color:${INK_STRONG};`,
  p: `margin:0 0 18px;font-size:16px;line-height:1.8;color:${INK};letter-spacing:0.5px;`,
  blockquote: `margin:24px 0;padding:14px 18px;border-left:4px solid #f0c9b8;background:${SOFT};color:#6b6357;font-size:15px;line-height:1.8;border-radius:0 8px 8px 0;`,
  ul: `margin:0 0 18px;padding-left:24px;list-style-type:disc;font-size:16px;line-height:1.8;color:${INK};`,
  ol: `margin:0 0 18px;padding-left:24px;list-style-type:decimal;font-size:16px;line-height:1.8;color:${INK};`,
  li: `margin:0 0 8px;line-height:1.8;list-style-position:outside;`,
  table: `width:100%;margin:24px 0;border-collapse:collapse;font-size:14px;line-height:1.6;`,
  th: `padding:9px 12px;border:1px solid ${HAIRLINE};background:${SOFT};font-weight:700;text-align:left;color:${INK_STRONG};`,
  td: `padding:9px 12px;border:1px solid ${HAIRLINE};text-align:left;vertical-align:top;color:${INK};`,
  hr: `border:none;border-top:1px solid ${HAIRLINE};margin:32px 0;`,
  strong: `font-weight:700;color:${INK_STRONG};`,
  em: `font-style:italic;`,
  s: `text-decoration:line-through;color:${MUTED};`,
  // 只有 mp.weixin.qq.com 的链接会保留成 <a>；其它外链已折叠成脚注
  a: `color:${ACCENT};text-decoration:none;border-bottom:1px solid ${ACCENT};`,
  // 行内代码；代码块里的 <code> 由 codeSection 单独给样式，不会再走到这里
  code: `font-family:${FONT_MONO};font-size:14px;background:#f4eee6;color:#c2563f;padding:2px 6px;border-radius:4px;letter-spacing:0;`,
  // 兜底的 <pre>（正常路径下会被 codeSection 替换掉）
  pre: `margin:24px 0;padding:16px 18px;background:${CODE_BG};color:${CODE_INK};border-radius:10px;font-family:${FONT_MONO};font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word;`,
  img: `max-width:100%;height:auto;display:block;margin:24px auto;border-radius:8px;`,
};

const CODE_WRAP = `margin:24px 0;padding:14px 16px 16px;background:${CODE_BG};border-radius:10px;`;
const CODE_LABEL = `margin:0 0 10px;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.08em;color:#8b97a5;`;
const CODE_PRE = `margin:0;padding:0;background:transparent;color:${CODE_INK};font-family:${FONT_MONO};font-size:13px;line-height:1.75;letter-spacing:0;white-space:pre-wrap;word-break:break-all;`;
const CODE_TEXT = `font-family:inherit;font-size:inherit;background:transparent;color:inherit;padding:0;`;

const NOTE_WRAP = `margin:24px 0;padding:16px 18px;border:1px dashed ${HAIRLINE};border-radius:10px;background:${SOFT};`;
const NOTE_TEXT = `margin:0 0 10px;font-size:13px;line-height:1.7;color:#a07a62;`;
const NOTE_PRE = `margin:0;padding:0;background:transparent;color:#6b6357;font-family:${FONT_MONO};font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word;`;

const FOOTNOTE_WRAP = `margin:40px 0 0;padding:18px 0 0;border-top:1px solid ${HAIRLINE};`;
const FOOTNOTE_TITLE = `margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1px;color:${MUTED};`;
const FOOTNOTE_ITEM = `margin:0 0 6px;font-size:12px;line-height:1.7;color:#9a9184;word-break:break-all;`;
const FOOTNOTE_MARK = `color:${ACCENT};font-size:12px;line-height:0;vertical-align:super;`;

/**
 * highlight.js 的 token 颜色。
 *
 * 公众号不认 class，所以必须把 `class="hljs-keyword"` 展开成 `style="color:…#f0a6a6"`。
 * 取值与站点 styles.css 里深色代码面的 token 完全一致，复制出去的代码块和站内长得一样。
 */
const HLJS_COLORS: Record<string, string> = {
  comment: "#8b8578",
  quote: "#8b8578",
  built_in: "#8b8578",
  meta: "#8b8578",
  keyword: "#f0a6a6",
  "selector-tag": "#f0a6a6",
  literal: "#f0a6a6",
  tag: "#f0a6a6",
  name: "#f0a6a6",
  string: "#a8d8a0",
  attr: "#a8d8a0",
  "template-variable": "#a8d8a0",
  number: "#f2c48a",
  symbol: "#f2c48a",
  bullet: "#f2c48a",
  title: "#9cc9f0",
  function: "#9cc9f0",
  type: "#e8d59a",
  class: "#e8d59a",
  variable: "#e8d59a",
};

/** 标准 HTML 实体解码（只处理会出现在 href 里的几个） */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 把代码块里的 hljs class 展开成内联颜色 */
function colorizeHighlight(body: string): string {
  return body.replace(/<span class="([^"]*)">/g, (_match, classes: string) => {
    const tokens = classes.split(/\s+/);
    for (const token of tokens) {
      const name = token.replace(/^hljs-/, "");
      const color = HLJS_COLORS[name];
      if (color) return `<span style="color:${color}">`;
    }
    // 没有配色映射的 token 也去掉 class：公众号会丢掉它，留着只是噪音
    return "<span>";
  });
}

function codeSection(label: string, body: string): string {
  const heading = label ? `<p style="${CODE_LABEL}">${label}</p>` : "";
  return `<section style="${CODE_WRAP}">${heading}<pre style="${CODE_PRE}"><code style="${CODE_TEXT}">${body}</code></pre></section>`;
}

/** 只有公众号自家的链接能保留为可点的 <a>，其余都会在粘贴时降级 */
function isWechatUrl(href: string): boolean {
  try {
    return new URL(href).hostname === "mp.weixin.qq.com";
  } catch {
    return false;
  }
}

/** HTML → 纯文本（剪贴板的 text/plain 兜底；富文本不可用时至少不是一坨标签） */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_match, alt: string) => (alt ? `[图片：${alt}]` : "[图片]"))
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr|section|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type WechatArticle = { html: string; text: string };

/**
 * 渲染公众号可粘贴的富文本。
 *
 * `origin` 用于把站内相对地址绝对化（由浏览器给当前访问地址）；
 * `locale` 只影响两处辅助文案（脚注标题、Mermaid 提示），正文内容与站点语言无关。
 */
export function renderWechatArticle(
  source: string,
  origin: string | null,
  locale: Locale,
): WechatArticle {
  let html = renderMarkdown(origin ? absolutizeMarkdown(source, origin) : source);

  // 1. 代码块：拆掉站点的 div/head/复制按钮，换成公众号能存活的 section + pre
  html = html.replace(
    /<div class="code-block"><div class="code-block__head"><span class="code-block__lang">([\s\S]*?)<\/span><button[\s\S]*?<\/button><\/div><pre class="code-block__pre"><code class="hljs language-[^"]*">([\s\S]*?)<\/code><\/pre><\/div>/g,
    (_match, label: string, body: string) => codeSection(label, colorizeHighlight(body)),
  );

  // 2. 未注册语言的裸 <pre><code>：同样给代码块外壳，只是没有语言名
  html = html.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (_match, body: string) => codeSection("", body),
  );

  // 3. Mermaid：公众号渲染不了图，留源码 + 一句提示，作者按图手动补图
  html = html.replace(
    /<figure class="diagram" data-mermaid><pre class="mermaid">([\s\S]*?)<\/pre><\/figure>/g,
    (_match, diagram: string) =>
      `<section style="${NOTE_WRAP}"><p style="${NOTE_TEXT}">${escapeHtml(t(locale, "wechat.mermaid_hint"))}</p><pre style="${NOTE_PRE}"><code style="${CODE_TEXT}">${diagram}</code></pre></section>`,
  );

  // 4. 外链折叠成脚注：公众号只放行 mp.weixin.qq.com，其它链接粘进去就只剩文字。
  //    这里保留文字 + [n] 角标，把 URL 统一放到文末，读者仍然拿得到地址。
  const links: string[] = [];
  const linkIndex = new Map<string, number>();
  html = html.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (match, rawHref: string, inner: string) => {
      const href = decodeEntities(rawHref);
      if (!href || href.startsWith("#")) return inner;
      if (isWechatUrl(href)) return `<a href="${rawHref}" style="${TAG_STYLES.a}">${inner}</a>`;
      if (!/^https?:\/\//i.test(href)) return inner;

      let index = linkIndex.get(href);
      if (!index) {
        index = links.length + 1;
        linkIndex.set(href, index);
        links.push(href);
      }
      return `${inner}<span style="${FOOTNOTE_MARK}">[${index}]</span>`;
    },
  );

  // 5. 给所有普通标签补内联样式。已有 style 的（代码块、脚注、公众号链接）跳过，
  //    避免把刚写好的样式覆盖掉 —— 只有表格单元格例外：markdown-it 会给对齐列写
  //    `style="text-align:right"`，跳过就会连边框和内边距一起丢掉，必须合并。
  html = html.replace(
    /<(h1|h2|h3|h4|p|blockquote|ul|ol|li|table|thead|tbody|tr|th|td|hr|strong|em|s|a|code|pre|img)(\s[^>]*)?>/gi,
    (match, tag: string, attrs = "") => {
      const name = tag.toLowerCase();
      const base = TAG_STYLES[name];
      if (!base) return match;

      const existing = /\bstyle="([^"]*)"/i.exec(attrs)?.[1];
      if (existing) {
        if (name === "th" || name === "td") {
          const merged = `${base}${existing}${existing.trim().endsWith(";") ? "" : ";"}`;
          return match.replace(/\sstyle="[^"]*"/i, ` style="${merged}"`);
        }
        return match;
      }
      return `<${tag}${attrs} style="${base}">`;
    },
  );

  // 6. 清掉公众号不认的属性。class / id / data-* 全部去掉，只留 style 与必要的 href/src/alt。
  html = html.replace(
    /\s(?:class|id|target|rel|loading|decoding|aria-[a-z-]+|data-[a-z-]+)="[^"]*"/gi,
    "",
  );

  if (links.length > 0) {
    const items = links
      .map((url, index) => `<p style="${FOOTNOTE_ITEM}">[${index + 1}] ${escapeHtml(url)}</p>`)
      .join("");
    html += `<section style="${FOOTNOTE_WRAP}"><p style="${FOOTNOTE_TITLE}">${escapeHtml(t(locale, "wechat.footnotes"))}</p>${items}</section>`;
  }

  const wrapped = `<section style="${ROOT}">${html}</section>`;
  return { html: wrapped, text: htmlToText(wrapped) };
}
