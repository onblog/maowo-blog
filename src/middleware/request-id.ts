import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

/** 每个请求一个 id：日志里能串起同一次请求的所有输出，错误页也展示它便于用户反馈 */
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.req.header("cf-ray") ?? crypto.randomUUID().slice(0, 8);
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};

/**
 * 结构化日志：只记慢请求与 5xx。
 * 全量日志会把免费额度吃掉，而排查问题时真正有用的是"慢的和错的"。
 */
export const requestLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now();
  await next();
  const duration = Date.now() - started;
  const status = c.res.status;
  if (status >= 500 || duration > 1000) {
    console.log(
      JSON.stringify({
        level: status >= 500 ? "error" : "warn",
        msg: "request",
        id: c.get("requestId"),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status,
        ms: duration,
      }),
    );
  }
};
