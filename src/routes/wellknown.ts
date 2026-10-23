import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getSite } from "../services/site";
import type { PostRow } from "../types";

/**
 * 机器可读入口：RSS / sitemap / robots。
 *
 * 个人博客的 RSS 比任何社交分发都重要 —— 存量博客用户的第一迁移成本就是
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
      const url = `${baseUrl(c.env)}/p/${post.slug}`;
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
  // 一次并行拉齐：文章 / 标签 / 合集。
  // 标签与合集的 lastmod 取「该集合内最新一篇文章」的更新时间，才有真实意义。
  const [posts, tags, series] = await Promise.all([
    c.env.DB.prepare(
      "SELECT slug, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 50000",
    ).all<{ slug: string; updated_at: number }>(),
    c.env.DB.prepare(
      `SELECT t.slug, MAX(p.updated_at) AS last_at
         FROM tags t
         JOIN post_tags pt ON pt.tag_id = t.id
         JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
        GROUP BY t.id`,
    ).all<{ slug: string; last_at: number }>(),
    c.env.DB.prepare(
      `SELECT s.slug, MAX(p.updated_at) AS last_at
         FROM series s
         JOIN posts p ON p.series_id = s.id AND p.status = 'published'
        GROUP BY s.id`,
    ).all<{ slug: string; last_at: number }>(),
  ]);

  // 列表页的 lastmod 用「全站最新更新时间」，**不能**用请求时刻：
  // 否则每次抓取都返回新时间，等于告诉搜索引擎这些页面天天在变，lastmod 直接失去信号价值。
  const siteUpdatedAt = posts.results.reduce((max, row) => Math.max(max, row.updated_at), 0) || null;
  const siteUpdatedIso = siteUpdatedAt ? new Date(siteUpdatedAt).toISOString() : null;

  const staticPaths = ["/", "/series", "/archive", "/tags", "/about", "/links"];
  const entries: Array<{ loc: string; lastmod: string | null }> = [
    ...staticPaths.map((path) => ({ loc: `${baseUrl(c.env)}${path}`, lastmod: siteUpdatedIso })),
    ...posts.results.map((row) => ({
      loc: `${baseUrl(c.env)}/p/${row.slug}`,
      lastmod: new Date(row.updated_at).toISOString(),
    })),
    ...tags.results.map((row) => ({
      loc: `${baseUrl(c.env)}/tags/${row.slug}`,
      lastmod: row.last_at ? new Date(row.last_at).toISOString() : null,
    })),
    ...series.results.map((row) => ({
      loc: `${baseUrl(c.env)}/series/${row.slug}`,
      lastmod: row.last_at ? new Date(row.last_at).toISOString() : null,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>${
      entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ""
    }
  </url>`,
  )
  .join("\n")}
</urlset>`;

  c.header("content-type", "application/xml; charset=utf-8");
  c.header("cache-control", "public, max-age=600");
  return c.body(xml);
});

wellKnown.get("/robots.txt", (c) => {
  // 后台是固定账号密码登录，接口不需要被索引；正文页/列表页全部放行。
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${baseUrl(c.env)}/sitemap.xml
`;
  c.header("content-type", "text/plain; charset=utf-8");
  c.header("cache-control", "public, max-age=3600");
  return c.body(body);
});
