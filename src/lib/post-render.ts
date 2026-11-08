import { renderMarkdownWithToc, type TocItem } from "./markdown";

export type RenderedPost = { html: string; toc: TocItem[] };

/**
 * 正文渲染的缓存键前缀（仅作 Cache API 内部键，不会被真正访问）。
 *
 * 为什么需要缓存：渲染要跑 markdown-it + highlight.js，一篇 100 KB、上百个代码块的
 * 文章实测中位 69.6 ms CPU，而 Free 计划的每请求 CPU 上限是 10 ms —— 每次访问都重渲染
 * 等于把每个读者都放在超限边缘。
 */
const CACHE_ORIGIN = "https://post-render.internal/render/";

/** key 里已带 `updated_at`，内容一改就换 key；TTL 只用来回收不再被访问的旧版本 */
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * 内存层：同 isolate 内零成本命中。
 *
 * 单靠边缘缓存不够快也不够稳（Cache API 是异步的，且跨数据中心不共享），
 * 而单靠内存又会在 isolate 回收时全部丢失。两层叠加：内存挡「同一篇文章被连读」，
 * 边缘缓存挡「隔几小时/换了个 PoP 再来读」。
 */
const MEMO_MAX_ENTRIES = 32;
const MEMO_MAX_BYTES = 8 * 1024 * 1024;

const memo = new Map<string, { value: RenderedPost; bytes: number }>();
let memoBytes = 0;

function memoGet(key: string): RenderedPost | undefined {
  const hit = memo.get(key);
  if (!hit) return undefined;
  // 命中即刷新 LRU 顺序
  memo.delete(key);
  memo.set(key, hit);
  return hit.value;
}

function memoSet(key: string, value: RenderedPost): void {
  const bytes = value.html.length;
  // 单篇就超过预算时不进内存（避免一篇文章挤掉全部热点）
  if (bytes > MEMO_MAX_BYTES) return;
  const existing = memo.get(key);
  if (existing) memoBytes -= existing.bytes;
  memo.set(key, { value, bytes });
  memoBytes += bytes;
  while (memo.size > MEMO_MAX_ENTRIES || memoBytes > MEMO_MAX_BYTES) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    const gone = memo.get(oldest);
    memo.delete(oldest);
    memoBytes -= gone?.bytes ?? 0;
  }
}

/** 清空内存层（单测隔离用） */
export function resetRenderMemo(): void {
  memo.clear();
  memoBytes = 0;
}

/** 渲染正文并抽目录：同一版本（id + updated_at）只真正渲染一次 */
export async function renderPostBody(post: {
  id: string;
  updated_at: number;
  content_md: string;
}): Promise<RenderedPost> {
  const key = `${CACHE_ORIGIN}${encodeURIComponent(post.id)}/${post.updated_at}`;

  const memoized = memoGet(key);
  if (memoized) return memoized;

  let edge: Cache | undefined;
  try {
    // 用具名 cache 隔离站点自身的 HTTP 缓存。`caches.default` 在类型定义里不存在，
    // 所以这里不做强断言，拿不到就走单层。
    edge = await caches.open("post-render");
    const hit = await edge.match(key);
    if (hit) {
      const value = (await hit.json()) as RenderedPost;
      memoSet(key, value);
      return value;
    }
  } catch (cause) {
    // 边缘缓存不可用（本地 dev / 缺缓存能力）时只记一次告警，随后仍走内存层。
    console.warn("[post-render] edge cache unavailable:", cause instanceof Error ? cause.message : String(cause));
    edge = undefined;
  }

  const rendered = renderMarkdownWithToc(post.content_md);
  memoSet(key, rendered);
  if (edge) {
    try {
      await edge.put(
        key,
        new Response(JSON.stringify(rendered), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": `max-age=${CACHE_TTL_SECONDS}`,
          },
        }),
      );
    } catch (cause) {
      console.warn("[post-render] edge cache put failed:", cause instanceof Error ? cause.message : String(cause));
    }
  }
  return rendered;
}
