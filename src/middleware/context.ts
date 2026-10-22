import type { MiddlewareHandler } from "hono";
import type { AppEnv, ColorMode, Locale } from "../types";
import { ADMIN_COOKIE, READER_COOKIE, readCookie } from "../lib/cookies";
import { readSession } from "../lib/session";
import { getSite } from "../services/site";
import { siteLocale } from "../lib/i18n";

/**
 * 请求上下文：站点资料 + 颜色模式 + 两种会话身份。
 *
 * 语言**不做运行时切换**：由部署时的 `SITE_LOCALE` 环境变量定死（默认 zh）。
 * 好处是 SSR 输出只有一种语言、没有「cookie 与页面文案不一致」的中间态，
 * 也没有多一轮查询去判断该用哪套文案。
 *
 * 顺序上放在守卫中间件**之后**：被 405/403 拦掉的垃圾请求不会消耗一次 D1 查询。
 */
export const loadContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const site = await getSite(c.env);
  const cookieHeader = c.req.header("cookie");

  // 语言只认部署时的环境变量，不再有运行时切换（也不回退到站点表）。
  const locale: Locale = siteLocale(c.env);

  // 颜色模式由作者在后台决定（light / dark / auto），读者端不再提供切换入口
  const colorMode: ColorMode =
    site.color_mode === "dark" ? "dark" : site.color_mode === "light" ? "light" : "auto";

  const [readerSession, adminSession] = await Promise.all([
    readSession(c.env, readCookie(cookieHeader, READER_COOKIE)),
    readSession(c.env, readCookie(cookieHeader, ADMIN_COOKIE)),
  ]);

  c.set("site", site);
  c.set("locale", locale);
  c.set("colorMode", colorMode);

  if (readerSession?.kind === "reader" && readerSession.user_json) {
    try {
      c.set("reader", JSON.parse(readerSession.user_json));
    } catch {
      c.set("reader", null);
    }
  }
  if (adminSession?.kind === "admin" && adminSession.user_json) {
    try {
      c.set("admin", JSON.parse(adminSession.user_json));
    } catch {
      c.set("admin", null);
    }
  }

  await next();
};

