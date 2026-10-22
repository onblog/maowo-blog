import { Hono } from "hono";
import { ulid } from "../lib/id";
import { requireAdminApi } from "../middleware/guards";
import type { AppEnv } from "../types";

/**
 * 图片：存 R2，按内容寻址（id 即 key），走 Worker 输出并带长缓存。
 *
 * 为什么不让 R2 直接公开：开源用户可能不想为图片单独配自定义域，
 * 由 Worker 代理一次请求更省事；`cache-control: immutable` + Cache API 让回源只发生一次。
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
  return new Response(object.body, { headers });
});
