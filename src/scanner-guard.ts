/**
 * 扫描器与漏洞探测流量的入口闸门。
 *
 * 背景（2026-11-18 的线上统计，见站长日报）：当天 242 次 404 里，绝大多数是
 * 扫描器在打 `wp-admin`、`.env`、`*.php` 这类本站根本不存在的路径。本站的 Worker
 * 会被资源层未命中的请求兜底调用（见 src/index.ts），所以这些请求会白跑一遍
 * 分流逻辑。
 *
 * 因此在交给 `siteApp` 之前先用纯字符串规则拦一道：
 *   - 路径命中扫描特征 → 404（不确认也不否认）；
 *   - UA 命中已知坏签名 → 403（11-18 那两个只拿到 504 的非浏览器客户端）。
 *
 * 只做字符串匹配，不读 env、不碰 D1/R2，单次开销是常数级。误伤面要守住 ——
 * `/admin/*`、`/api/*`、文章页与 `/render/...` 内部渲染路径都不能命中。
 */

/** 已知的坏客户端签名（2026-11-18 全天只拿到 504，没有一次 200）。 */
const BLOCKED_USER_AGENTS = new Set(['nginx-ssl early hints', 'fl2 early hints']);

/**
 * 扫描路径特征：
 *   1. WordPress 探测（`/wp-admin/`、`/wp-login.php`、`/wp-content/...`）；
 *   2. 任何 `.php` 结尾的段（本站没有 PHP，命中必是探测）；
 *   3. 点文件（`.env`、`.git/config`、`.aws/...` 等）；
 *   4. 常见后台与中间件指纹（`phpmyadmin`、`actuator`、`cgi-bin`、`_profiler` 等）；
 *   5. 备份与配置文件后缀（`.sql`、`.bak`、`.old`、`.swp`、`*.tfvars`）。
 */
const SCAN_PATTERNS: readonly RegExp[] = [
  /\/wp-[a-z]/i,
  /\.php(?=$|[/?#])/i,
  /\/\.(?:env|git|svn|hg|docker|aws|ssh|npmrc|boto|ds_store|dockercfg|idea|vscode|cursor)(?=$|[/?#.])/i,
  /\/(?:phpinfo|phpmyadmin|pma|adminer|xmlrpc|wlwmanifest|cgi-bin|actuator|nacos|solr|jenkins|telescope|_profiler|server-status|docker-compose|dockerfile)(?=$|[/?#])/i,
  /\.(?:sql|bak|old|swp|swo|orig|save|tfvars)(?=$|[/?#])/i,
];

/** 是否是扫描器的路径探测特征。`pathname` 必须是已解析的路径（不含 query）。 */
export function isScannerPath(pathname: string): boolean {
  return SCAN_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** 是否是已知的坏客户端。空 UA 不算 —— 健康检查与内部子请求都可能不带 UA。 */
export function isScannerUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BLOCKED_USER_AGENTS.has(userAgent.trim().toLowerCase());
}

/** 闸门放行的 4xx 响应：纯文本、不缓存、不进索引。 */
function blockedResponse(status: 403 | 404): Response {
  return new Response(status === 403 ? 'Forbidden' : 'Not Found', {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * 命中扫描特征时返回 4xx 响应，否则返回 `null`，调用方继续正常分流。
 *
 * UA 先判：那两类客户端无论打什么路径都不该被服务，直接 403 比 404 更明确。
 */
export function scannerResponseFor(request: Request, pathname: string): Response | null {
  if (isScannerUserAgent(request.headers.get('User-Agent'))) return blockedResponse(403);
  if (isScannerPath(pathname)) return blockedResponse(404);
  return null;
}
