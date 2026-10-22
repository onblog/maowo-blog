import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { getById, listAllForAdmin } from "../services/posts";
import { listAll } from "../services/comments";
import { buildAgentPrompt } from "../lib/agent-prompt";
import { getSeriesById, listSeriesNames } from "../services/series";
import {
  AdminCommentsPage,
  AdminEditorPage,
  AdminMigratePage,
  AdminLoginPage,
  AdminPostsPage,
  AdminSettingsPage,
} from "../views/admin";

/**
 * 后台页面（同域 `/admin`）。
 *
 * 与前台共用同一个 Worker、同一套 token，但路由与中间件独立：
 * 所有写操作走 `/api/admin/*`（页面只负责渲染与表单），因此这里全是 GET。
 * 未登录一律 302 到 `/admin/login`，登录后回到原地址。
 */
export const adminPages = new Hono<AppEnv>();

function base(c: Context<AppEnv>) {
  return {
    site: c.get("site"),
    locale: c.get("locale"),
    theme: c.get("theme"),
  };
}

function guard(c: Context<AppEnv>): Response | null {
  if (c.get("admin")) return null;
  const next = new URL(c.req.url).pathname;
  return c.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 302);
}

adminPages.get("/login", async (c) => {
  if (c.get("admin")) return c.redirect("/admin", 302);
  return c.html(<AdminLoginPage {...base(c)} />);
});

adminPages.get("/", async (c) => {
  const blocked = guard(c);
  if (blocked) return blocked;
  const posts = await listAllForAdmin(c.env);
  return c.html(<AdminPostsPage {...base(c)} admin={c.get("admin")!} posts={posts} />);
});

adminPages.get("/new", async (c) => {
  const blocked = guard(c);
  if (blocked) return blocked;
  const seriesNames = await listSeriesNames(c.env);
  return c.html(
    <AdminEditorPage {...base(c)} admin={c.get("admin")!} post={null} tags="" seriesName="" seriesNames={seriesNames} />,
  );
});

adminPages.get("/edit/:id", async (c) => {
  const blocked = guard(c);
  if (blocked) return blocked;
  const post = await getById(c.env, c.req.param("id"));
  if (!post) return c.redirect("/admin", 302);

  // 标签回填：从 post_tags 取出名字拼成逗号串
  const { results } = await c.env.DB.prepare(
    "SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ? ORDER BY t.name",
  )
    .bind(post.id)
    .all<{ name: string }>();

  const series = post.series_id ? await getSeriesById(c.env, post.series_id) : null;
  const seriesNames = await listSeriesNames(c.env);

  return c.html(
    <AdminEditorPage
      {...base(c)}
      admin={c.get("admin")!}
      post={post}
      tags={results.map((row) => row.name).join(", ")}
      seriesName={series?.name ?? ""}
      seriesNames={seriesNames}
    />,
  );
});

adminPages.get("/comments", async (c) => {
  const blocked = guard(c);
  if (blocked) return blocked;
  const comments = await listAll(c.env, 200);
  return c.html(<AdminCommentsPage {...base(c)} admin={c.get("admin")!} comments={comments} />);
});

adminPages.get("/settings", async (c) => {
  const blocked = guard(c);
  if (blocked) return blocked;
  return c.html(<AdminSettingsPage {...base(c)} admin={c.get("admin")!} />);
});

adminPages.get("/migrate", async (c) => {
  const blocked = guard(c);
  if (blocked) return blocked;
  const prompt = buildAgentPrompt(c.get("locale"), c.env.SITE_URL);
  return c.html(<AdminMigratePage {...base(c)} admin={c.get("admin")!} prompt={prompt} />);
});
