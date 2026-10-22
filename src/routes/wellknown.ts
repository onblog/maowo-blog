import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getSite } from "../services/site";
import type { PostRow } from "../types";

/**
 * 机器可读入口：RSS / sitemap / robots。
 *
 * 单人博客的 RSS 比任何社交分发都重要 —— 存量博客用户的第一迁移成本就是
 * "订阅者会不会丢"。所以 RSS 输出完整正文（content:encoded），订阅器里能直接读。
 */
export const wellKnown = new Hono<AppEnv>();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(ms: number): string {
  return new Date(ms).toUTCString();
}

function baseUrl(env: Env): string {
  return env.SITE_URL.replace(/\/$/, "");
}

wellKnown.get("/feed.xml", async (c) => {
  const site = await getSite(c.env);
  const name = site.name;
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 30",
  ).all<PostRow>();

  const items = results
    .map((post) => {
      const url = `${baseUrl(c.env)}/${post.slug}`;
      const published = post.published_at ?? post.created_at;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${rfc822(published)}</pubDate>
      <description>${escapeXml(post.excerpt ?? "")}</description>
      <content:encoded><![CDATA[${post.content_md}]]></content:encoded>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(name)}</title>
    <link>${escapeXml(baseUrl(c.env))}</link>
    <description>${escapeXml(site.tagline)}</description>
    <language>${c.get("locale") === "zh" ? "zh-CN" : "en"}</language>
    <atom:link href="${escapeXml(baseUrl(c.env))}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  c.header("content-type", "application/rss+xml; charset=utf-8");
  c.header("cache-control", "public, max-age=600");
  return c.body(xml);
});

wellKnown.get("/sitemap.xml", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT slug, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC",
  ).all<{ slug: string; updated_at: number }>();

  const staticPaths = ["/", "/archive", "/tags", "/about"];
  const entries = [
    ...staticPaths.map((path) => ({ loc: `${baseUrl(c.env)}${path}`, lastmod: new Date().toISOString() })),
    ...results.map((row) => ({
      loc: `${baseUrl(c.env)}/${row.slug}`,
      lastmod: new Date(row.updated_at).toISOString(),
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  c.header("content-type", "application/xml; charset=utf-8");
  c.header("cache-control", "public, max-age=600");
  return c.body(xml);
});

wellKnown.get("/robots.txt", (c) => {
  const body = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${baseUrl(c.env)}/sitemap.xml
`;
  c.header("content-type", "text/plain; charset=utf-8");
  return c.body(body);
});
