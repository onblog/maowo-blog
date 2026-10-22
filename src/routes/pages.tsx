import { Hono } from "hono";
import type { Context } from "hono";
import { renderMarkdownWithToc } from "../lib/markdown";
import type { AppEnv } from "../types";
import { getSite, parseLinks } from "../services/site";
import {
  archiveGroups,
  getNeighbours,
  getPublishedBySlug,
  incrementViews,
  listPublished,
  siteStats,
} from "../services/posts";
import { listTags, getTagBySlug } from "../services/tags";
import { getSeriesBySlug, listSeries, listSeriesPosts } from "../services/series";
import { buildTree, countForPost, listVisible } from "../services/comments";
import { HomePage } from "../views/home";
import { AboutPage, ArchivePage, LinksPage, NotFoundPage, SeriesListPage, SeriesPage, TagPage, TagsPage } from "../views/pages";
import { PostPage } from "../views/post";

/** 前台页面路由。`/:slug` 必须是最后一个注册的（兜底文章地址）。 */
export const pages = new Hono<AppEnv>();

function baseProps(c: Context<AppEnv>) {
  return {
    site: c.get("site"),
    locale: c.get("locale"),
    colorMode: c.get("colorMode"),
    reader: c.get("reader"),
    admin: c.get("admin"),
  };
}

pages.get("/", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const [list, stats] = await Promise.all([listPublished(c.env, { page }), siteStats(c.env)]);
  return c.html(
    <HomePage {...baseProps(c)} list={list} stats={stats} />,
  );
});

pages.get("/series", async (c) => {
  const series = await listSeries(c.env);
  return c.html(<SeriesListPage {...baseProps(c)} series={series} />);
});

pages.get("/series/:slug", async (c) => {
  const slug = decodeURIComponent(c.req.param("slug"));
  const series = await getSeriesBySlug(c.env, slug);
  if (!series) return c.html(<NotFoundPage {...baseProps(c)} />, 404);
  const posts = await listSeriesPosts(c.env, series.id);
  return c.html(<SeriesPage {...baseProps(c)} series={series} posts={posts} />);
});

pages.get("/archive", async (c) => {
  const groups = await archiveGroups(c.env);
  const total = groups.reduce((sum, group) => sum + group.posts.length, 0);
  return c.html(<ArchivePage {...baseProps(c)} groups={groups} total={total} />);
});

pages.get("/tags", async (c) => {
  const tags = await listTags(c.env);
  return c.html(<TagsPage {...baseProps(c)} tags={tags} />);
});

pages.get("/tags/:slug", async (c) => {
  const slug = decodeURIComponent(c.req.param("slug"));
  const tag = await getTagBySlug(c.env, slug);
  if (!tag) return c.html(<NotFoundPage {...baseProps(c)} />, 404);
  const list = await listPublished(c.env, { tagSlug: slug, perPage: 100 });
  return c.html(<TagPage {...baseProps(c)} tagName={tag.name} posts={list.items} />);
});

pages.get("/about", async (c) => {
  return c.html(<AboutPage {...baseProps(c)} />);
});

// 友情链接：独立页，每条 = 站点名 + 一句话简介 + 头像
pages.get("/links", async (c) => {
  const site = await getSite(c.env);
  return c.html(<LinksPage {...baseProps(c)} links={parseLinks(site.owner_links)} />);
});

// 文章详情：固定在 /p/{数字} 下 —— 与 /archive、/about、/series 这些静态页彻底分开
pages.get("/p/:slug", async (c) => {
  const slug = decodeURIComponent(c.req.param("slug"));
  const post = await getPublishedBySlug(c.env, slug);
  if (!post) return c.html(<NotFoundPage {...baseProps(c)} />, 404);

  const { html, toc } = renderMarkdownWithToc(post.content_md);
  const [neighbours, commentRows, commentCount] = await Promise.all([
    getNeighbours(c.env, post),
    listVisible(c.env, post.id),
    countForPost(c.env, post.id),
  ]);

  // 阅读数在渲染后自增：这一次的展示值是本次访问前的数，语义上是「此前被看过多少次」
  c.executionCtx.waitUntil(incrementViews(c.env, post.id));

  return c.html(
    <PostPage
      {...baseProps(c)}
      post={post}
      html={html}
      toc={toc}
      prev={neighbours.prev}
      next={neighbours.next}
      comments={buildTree(commentRows)}
      commentCount={commentCount}
    />,
  );
});

// 兼容旧地址：/{数字} 301 到 /p/{数字}，已分享过的链接不会断
pages.get("/:slug", (c) => {
  const slug = decodeURIComponent(c.req.param("slug"));
  if (/^\d+$/.test(slug)) return c.redirect(`/p/${slug}`, 301);
  return c.html(<NotFoundPage {...baseProps(c)} />, 404);
});
