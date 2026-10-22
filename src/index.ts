import { siteApp } from "./site";

/**
 * Worker 入口。
 *
 * 单人博客没有前后台「分域」的必要：后台就在 `/admin`，与前台共用同一个 Worker
 * 和同一份设计 token。这样开源用户部署时只需要一个自定义域，也不用维护 DNS 分流。
 */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return siteApp.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
