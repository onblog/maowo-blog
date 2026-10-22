import { Hono } from "hono";
import type { Context } from "hono";
import { apiPrefixGuard, originGuard } from "./middleware/guards";
import { loadContext } from "./middleware/context";
import { requestId, requestLog } from "./middleware/request-id";
import { adminPages } from "./routes/admin";
import { api } from "./routes/api";
import { authRoutes } from "./routes/auth";
import { mediaApi, mediaFiles } from "./routes/media";
import { pages } from "./routes/pages";
import { prefRoutes } from "./routes/prefs";
import { wellKnown } from "./routes/wellknown";
import type { AppEnv } from "./types";
import { NotFoundPage } from "./views/pages";

/**
 * 前台应用（页面 + API）。
 *
 * 中间件顺序即语义：
 *   1. requestId      —— 最先，保证错误处理也带上它
 *   2. requestLog     —— 只记慢请求与 5xx，省额度
 *   3. apiPrefixGuard —— 非 /api/* 的写请求直接 405（所有写操作都走 API）
 *   4. originGuard    —— 跨站写请求 403（CSRF 最小防线）
 *   5. loadContext    —— 站点资料 + 语言/形态 + 两种会话；放在守卫之后，垃圾请求不查库
 *
 * 路由注册顺序很重要：
 *   /api/* → /media/* → /admin/* → 页面（最后是 `/:slug` 兜底）
 */
export function createSiteApp() {
  const app = new Hono<AppEnv>();

  app.use("*", requestId);
  app.use("*", requestLog);
  app.use("*", apiPrefixGuard);
  app.use("*", originGuard);
  app.use("*", loadContext);

  app.route("/api/auth", authRoutes);
  app.route("/api/prefs", prefRoutes);
  app.route("/api", mediaApi);
  app.route("/api", api);
  app.route("/", mediaFiles);
  app.route("/", wellKnown);
  app.route("/admin", adminPages);
  app.route("/", pages);

  app.notFound(async (c) => {
    const ctx = c as unknown as Context<AppEnv>;
    return c.html(
      <NotFoundPage
        site={ctx.get("site")}
        locale={ctx.get("locale")}
        theme={ctx.get("theme")}
        reader={ctx.get("reader")}
        admin={ctx.get("admin")}
      />,
      404,
    );
  });

  app.onError((err, c) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "unhandled",
        id: c.get("requestId"),
        path: new URL(c.req.url).pathname,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return c.text("Internal Server Error", 500);
  });

  return app;
}

export const siteApp = createSiteApp();
