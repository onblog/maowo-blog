import { Hono } from "hono";
import type { AppEnv } from "../types";
import { withTimeout } from "../lib/html";

/**
 * 友链图标代理：给定站点 URL，尝试抓它的 /favicon.ico 与 /favicon.png。
 *
 * 为什么由后端代理而不是直接让浏览器请求对方域名：
 *   - 混合内容：本站是 https，对方 favicon 若是 http 会被浏览器拦；
 *   - 隐私：页面里的 <img> 会把访问者 IP 暴露给每个友链站点；
 *   - 抓不到时统一返回 404，前端回退首字母，不留破图。
 *
 * 结果写入边缘缓存（Cache API），一天内同一 origin 只回源一次。
 */
export const favicon = new Hono<AppEnv>();

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 200 * 1024;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 500);
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

favicon.get("/favicon", async (c) => {
  const origin = normalizeOrigin(c.req.query("url") ?? "");
  if (!origin) return c.json({ error: "invalid_url" }, 400);

  // Workers 的 CacheStorage 暴露 default 缓存，但生成类型里没有这个属性
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://favicon.internal/${encodeURIComponent(origin)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  for (const candidate of [`${origin}/favicon.ico`, `${origin}/favicon.png`]) {
    try {
      const res = await withTimeout(
        fetch(candidate, { headers: { "user-agent": UA, accept: "image/*" }, redirect: "follow" }),
        FETCH_TIMEOUT_MS,
        "favicon",
      );
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) continue;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) continue;

      const response = new Response(buffer, {
        headers: {
          "content-type": type,
          "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
          "x-favicon-origin": origin,
        },
      });
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      // 超时 / 网络错误：试下一个候选，都不行就 404
    }
  }

  return c.notFound();
});
