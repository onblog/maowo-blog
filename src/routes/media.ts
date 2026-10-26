import { Hono } from "hono";
import { ulid } from "../lib/id";
import { requireAdminApi } from "../middleware/guards";
import type { AppEnv } from "../types";

/**
 * 图片：存 R2，按内容寻址（id 即 key），走 Worker 输出并带长缓存。
 *
 * 为什么不让 R2 直接公开：开源用户可能不想为图片单独配自定义域，
 * 由 Worker 代理一次请求更省事；`cache-control: immutable` + Cache API 让回源只发生一次。
 *
 * **显式不校验 Referer，并主动声明跨域可用**：
 * 图片的用途不只是本站页面 —— 文章被搬到微信公众号、掘金、知乎时，对方编辑器会
 * 用自己的服务器去抓图（可能不带 Referer，也可能带一个外站 Referer）。任何形式的
 * 防盗链判断都会让搬运直接失败，所以这里一律放行；`cross-origin-resource-policy`
 * 与 CORS 只是把这个决定写进响应头，避免浏览器端再产生一次「同源策略」的意外拦截。
 * 如果线上仍然拿到 403，问题在 Cloudflare 区域级的 Hotlink Protection（Dashboard 设置，
 * 不在本仓库），需要去那里关掉。
 */
export const mediaApi = new Hono<AppEnv>();
export const mediaFiles = new Hono<AppEnv>();

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"]);

mediaApi.post("/admin/media", requireAdminApi, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file_required" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "file_too_large" }, 413);
  if (!ALLOWED.has(file.type)) return c.json({ error: "unsupported_type", type: file.type }, 415);

  const ext = file.type.split("/")[1]?.replace("svg+xml", "svg") ?? "bin";
  const key = `media/${ulid()}.${ext}`;
  await c.env.R2_MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });

  return c.json({ ok: true, url: `/media/${key.slice("media/".length)}` });
});

mediaFiles.get("/media/:name", async (c) => {
  const name = c.req.param("name");
  const key = `media/${name.replace(/^.*\//, "")}`;
  const object = await c.env.R2_MEDIA.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  // 任意 Referer 都能加载：不做防盗链，明确允许被外站引用
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("access-control-allow-origin", "*");
  return new Response(object.body, { headers });
});
