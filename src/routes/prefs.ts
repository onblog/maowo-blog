import { Hono } from "hono";
import { THEME_COOKIE, readCookie } from "../lib/cookies";
import { safeNextPath } from "../lib/security";
import { setThemeCookie } from "../lib/session-cookie";
import type { AppEnv } from "../types";

/**
 * 主题形态切换（cute / minimal）。
 *
 * 语言不在运行时切换 —— 它由部署环境变量 `SITE_LOCALE` 定死（见 middleware/context.ts）。
 * 这里只处理「形态」：「可爱」与「极简」是两套 token，切换会落 cookie 并立刻重渲染。
 */
export const prefRoutes = new Hono<AppEnv>();

prefRoutes.get("/style", (c) => {
  const to = c.req.query("to") === "minimal" ? "minimal" : "cute";
  setThemeCookie(c, to);
  return c.redirect(safeNextPath(c.req.query("next")), 302);
});

/** 读取当前形态（客户端不想靠 cookie 猜时用） */
prefRoutes.get("/style/current", (c) => {
  const current = readCookie(c.req.header("cookie"), THEME_COOKIE);
  return c.json({ style: current === "minimal" ? "minimal" : "cute" });
});
