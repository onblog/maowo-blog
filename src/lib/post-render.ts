import { renderMarkdownWithToc, type TocItem } from "./markdown";

export type RenderedPost = { html: string; toc: TocItem[] };

/**
 * 渲染结果缓存的 key 前缀（仅作 Cache API 的内部键，不会被访问）。
 *
 * 为什么用 Cache API 而不是模块级 Map：文章正文渲染要跑 markdown-it + highlight.js，
 * 一篇 100 KB、上百个代码块的文章实测中位耗时 ~70 ms CPU（见 README 的性能一节），
 * 而博客的访问是「少量文章反复读 + 大量文章长期没人读」。模块内存在 isolate 回收时
 * 一起丢掉，冷启动命中率接近零；Cache API 落在边缘存储上，跨 isolate 复用。
 */
const CACHE_ORIGIN = "https://post-render.internal/render/";

/** 缓存有效期：key 里已经带了 updated_at，内容一改就换 key，所以这里只防无限增长 */
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

/** 渲染缓存所在的具名 cache（与站点 HTTP 缓存隔离） */
const CACHE_NAME = "post-render";

/** 渲染正文并抽目录：同一版本（id + updated_at）只真正渲染一次 */
export async function renderPostBody(post: {
  id: string;
  updated_at: number;
  content_md: string;
}): Promise<RenderedPost> {
  const key = `${CACHE_ORIGIN}${encodeURIComponent(post.id)}/${post.updated_at}`;
  try {
    // 用具名 cache 而不是 `caches.default`：渲染结果与站点自身的 HTTP 缓存互不干扰，
    // `caches.open()` 也是 Workers 与 miniflare/vitest 都支持的标准写法（类型里没有 default）。
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as RenderedPost;

    const rendered = renderMarkdownWithToc(post.content_md);
    await cache.put(
      key,
      new Response(JSON.stringify(rendered), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `max-age=${CACHE_TTL_SECONDS}`,
        },
      }),
    );
    return rendered;
  } catch {
    // 缓存不可用（本地 dev / 未提供 caches 绑定的环境）时退回直接渲染：
    // 渲染是纯函数，降级只损失性能，不影响输出。
    return renderMarkdownWithToc(post.content_md);
  }
}
