import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

/** 每个请求一个 id：日志里能串起同一次请求的所有输出，错误页也展示它便于用户反馈 */
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header("cf-ray") ?? crypto.randomUUID().slice(0, 8);
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};

/** 慢请求阈值（毫秒）：超过它就记一条 warn，用于排查 SSR 页面退化 */
export const SLOW_REQUEST_MS = 1000;

/**
 * 结构化日志：只记慢请求与 5xx。
 * 全量日志会把免费额度吃掉，而排查问题时真正有用的是"慢的和错的"。
 *
 * 两个字段是给「按条件聚合」用的，缺了就没法在面板上分组：
 *   * `route` —— Hono 的路由模板（`/p/:slug`）。按真实 `path` 聚合会把每篇文章
 *     各算一组，219 条慢请求会散成两百多个分组，看不出热点在哪个路由。
 *   * `msg` —— `request.slow` / `request.error`。Workers Logs 只能按
 *     `$metadata.message` 这类顶层字段分组，两者共用 "request" 时无法区分
 *     「慢」和「真的挂了」，日志级别又会被 span 事件淹掉。
 */
export const requestLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now();
  await next();
  const duration = Date.now() - started;
  const status = c.res.status;
  if (status >= 500 || duration > SLOW_REQUEST_MS) {
    const failed = status >= 500;
    console.log(
      JSON.stringify({
        level: failed ? "error" : "warn",
        msg: failed ? "request.error" : "request.slow",
        route: c.req.routePath,
        id: c.get("requestId"),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status,
        ms: duration,
      }),
    );
  }
};
