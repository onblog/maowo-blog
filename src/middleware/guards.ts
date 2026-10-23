import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

/**
 * 写请求只允许走 `/api/*`。
 *
 * 页面路由没有第二个写入口：所有表单提交都是 fetch 打到 `/api/*`。
 * 这样一条中间件就把「扫描器随手 POST 页面路径」挡在业务逻辑之外，
 * 也让 CSRF 面收敛到 API 层（API 层另有 Origin 校验）。
 */
export const apiPrefixGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method;
  const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (isWrite && !new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: "method_not_allowed" }, 405);
  }
  await next();
};

/**
 * CSRF 最小防线：带 Origin 的写请求必须与本站同源。
 * 现代浏览器的 fetch 默认带 Origin；缺失时放行（非浏览器客户端，如 curl / 测试）。
 */
export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method;
  const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (!isWrite) {
    await next();
    return;
  }
  const origin = c.req.header("origin");
  if (!origin) {
    await next();
    return;
  }
  const host = c.req.header("host");
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      return c.json({ error: "forbidden_origin" }, 403);
    }
  } catch {
    return c.json({ error: "forbidden_origin" }, 403);
  }
  await next();
};

/**
 * 后台接口守卫：没有 admin 会话一律 401（页面跳登录页另在路由内处理）。
 *
 * 出厂默认口令（admin/admin）期间再拦一层 403：默认口令写在公开仓库里，
 * 谁都知道，所以"先改密"必须由服务端强制。`/api/admin/account` 刻意不挂这个守卫
 * —— 它是强制流程的唯一出口，由路由自己判断登录态。
 */
export const requireAdminApi: MiddlewareHandler<AppEnv> = async (c, next) => {
  const admin = c.get("admin");
  if (!admin) return c.json({ error: "unauthorized" }, 401);
  if (admin.mustChange) return c.json({ error: "password_change_required" }, 403);
  await next();
};
