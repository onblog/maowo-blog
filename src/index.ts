import { siteApp } from "./site";
import { scannerResponseFor } from "./scanner-guard";

/**
 * Worker 入口。
 *
 * 个人博客没有前后台「分域」的必要：后台就在 `/admin`，与前台共用同一个 Worker
 * 和同一份设计 token。这样开源用户部署时只需要一个自定义域，也不用维护 DNS 分流。
 */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    // 入口闸门：扫描器/漏洞探测（`wp-admin`、`.env`、`*.php`…）与已知坏 UA
    // 在这里直接回 4xx，不进站点路由。规则与判据见 src/scanner-guard.ts。
    const scanBlocked = scannerResponseFor(request, new URL(request.url).pathname);
    if (scanBlocked) return scanBlocked;
    return siteApp.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
