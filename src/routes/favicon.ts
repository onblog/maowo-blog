import { Hono } from "hono";
import type { AppEnv } from "../types";
import { withTimeout } from "../lib/html";
import {
  MAX_ICO_CONTAINER_BYTES,
  dedupeCandidates,
  parseIconLinks,
  toIconPayload,
} from "../lib/favicon";

/**
 * 友链图标代理：给定站点 URL，替前端把它的图标抓回来并**压成一张小图**。
 *
 * 为什么由后端代理而不是直接让浏览器请求对方域名：
 *   - 混合内容：本站是 https，对方 favicon 若是 http 会被浏览器拦；
 *   - 隐私：页面里的 <img> 会把访问者 IP 暴露给每个友链站点；
 *   - 体积：对方可能只提供 370 KB 的多帧 .ico，代理可以只回一帧（见 lib/favicon）。
 *
 * 候选顺序（第一个拿到合法图片的就赢）：
 *   1. 抓首页 HTML，按 `<link rel="icon">` 的优先级取声明地址（兼容 SVG / 带 hash 的 PNG）；
 *   2. 根目录 /favicon.ico；
 *   3. 根目录 /favicon.png。
 *
 * 全部落空 → 404，前端回退成站点首字母，不留破图。
 * 结果写入边缘缓存：成功 24h，失败只缓存 10 分钟（对方修好后能自动恢复）。
 */
export const favicon = new Hono<AppEnv>();

const PAGE_TIMEOUT_MS = 3_000;
const IMAGE_TIMEOUT_MS = 4_000;
const MAX_PAGE_BYTES = 512 * 1024;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const NEGATIVE_TTL_SECONDS = 10 * 60;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * 图片响应统一的安全头。
 *
 * CSP 里的 `sandbox` 是关键：第三方 SVG 是会被当作脚本执行的富文本，
 * 如果有人直接把 `/api/favicon?url=...svg` 当页面打开，同源执行就等于 XSS。
 * 加 sandbox 后即使被当文档打开也拿不到本站的存储与 cookie。
 */
const ICON_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "cross-origin-resource-policy": "same-origin",
};

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 500);
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // 拒绝 IP 字面量与 localhost：这个接口公开可达，别让它变成内网探测代理
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host.includes(":")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

type Fetched = { bytes: Uint8Array; contentType: string };

/** 转成精确长度的 ArrayBuffer：Response / Cache API 只认这种，顺带保证字节偏移归零 */
function toBody(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** 带超时 + 体积上限的抓取；任何异常都退化成 null，让调用方试下一个候选 */
async function fetchLimited(
  url: string,
  accept: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<Fetched | null> {
  try {
    return await withTimeout(
      (async (): Promise<Fetched | null> => {
        const response = await fetch(url, {
          headers: { "user-agent": UA, accept },
          redirect: "follow",
          cf: { cacheTtl: 3_600, cacheEverything: true },
        });
        if (!response.ok) return null;
        const declared = Number(response.headers.get("content-length") ?? "0");
        if (declared > maxBytes) return null; // 提前放弃，别把大文件拖下来
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) return null;
        return {
          bytes: new Uint8Array(buffer),
          contentType: response.headers.get("content-type") ?? "",
        };
      })(),
      timeoutMs,
      "favicon",
    );
  } catch {
    return null;
  }
}

/** 抓首页 HTML 里声明的图标地址；首页拿不到就返回空数组（还能靠根路径兜底） */
async function discoverDeclaredIcons(origin: string): Promise<string[]> {
  const page = await fetchLimited(`${origin}/`, "text/html,application/xhtml+xml", PAGE_TIMEOUT_MS, MAX_PAGE_BYTES);
  if (!page) return [];
  if (page.contentType && !/html|xml/i.test(page.contentType)) return [];
  const html = new TextDecoder("utf-8", { fatal: false }).decode(page.bytes);
  return parseIconLinks(html, `${origin}/`);
}

favicon.get("/favicon", async (c) => {
  const origin = normalizeOrigin(c.req.query("url") ?? "");
  if (!origin) return c.json({ error: "invalid_url" }, 400);

  // Workers 的 CacheStorage 暴露 default 缓存，但生成类型里没有这个属性
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://favicon.internal/v2/${encodeURIComponent(origin)}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    // 负缓存只存一个标记，命中后照样走本站的 404 页面
    if (cached.status === 404) return c.notFound();
    return cached;
  }

  const declared = await discoverDeclaredIcons(origin);
  const candidates = dedupeCandidates([...declared, `${origin}/favicon.ico`, `${origin}/favicon.png`]);

  for (const candidate of candidates) {
    const fetched = await fetchLimited(candidate, "image/*", IMAGE_TIMEOUT_MS, MAX_ICO_CONTAINER_BYTES);
    if (!fetched) continue;
    const payload = toIconPayload(fetched.bytes, fetched.contentType);
    if (!payload) continue;

    const response = new Response(toBody(payload.body), {
      headers: {
        ...ICON_HEADERS,
        "content-type": payload.type,
        "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
        "x-favicon-origin": origin,
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }

  c.executionCtx.waitUntil(
    cache.put(
      cacheKey,
      new Response(null, {
        status: 404,
        headers: { "cache-control": `public, max-age=${NEGATIVE_TTL_SECONDS}` },
      }),
    ),
  );
  return c.notFound();
});
