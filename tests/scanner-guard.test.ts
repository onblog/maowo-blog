import { describe, expect, it } from "vitest";

import { isScannerPath, isScannerUserAgent, scannerResponseFor } from "../src/scanner-guard";

/**
 * 闸门跑在站点路由之前，误伤一个真实页面或后台接口的代价远大于多接几个探测请求，
 * 所以「必须拦」与「绝不能拦」两组路径都钉在这里。
 */

/** 2026-11-18 真实出现过的探测路径。 */
const SCAN_PATHS = [
  "/wp-admin/",
  "/wp-login.php",
  "/wp-content/plugins/about.php",
  "/index.php",
  "/db.php",
  "/.env",
  "/config/.env",
  "/.env.example",
  "/.git/config",
  "/.docker/config.json",
  "/.aws/credentials",
  "/phpmyadmin/",
  "/cgi-bin/php",
  "/xmlrpc.php",
  "/actuator/env",
  "/telescope/requests",
  "/_profiler/phpinfo",
  "/database.sql",
  "/backup.old",
  "/config.swp",
  "/*.auto.tfvars",
  "/Dockerfile",
];

/** 真实路由：文章页、后台、接口与内部渲染路径。 */
const ALLOWED_PATHS = [
  "/",
  "/posts/hello-world",
  "/tags/notes",
  "/archive",
  "/admin",
  "/admin/posts",
  "/api/posts",
  "/api/admin/session",
  "/render/01m5hjj8qefcn0xfvrs6nz8abq/1792673320877",
  "/media/cover.webp",
  "/rss.xml",
  "/sitemap.xml",
  "/robots.txt",
  "/.well-known/security.txt",
];

describe("scan paths", () => {
  it.each(SCAN_PATHS)("拦截 %s", (pathname) => {
    expect(isScannerPath(pathname)).toBe(true);
  });

  it.each(ALLOWED_PATHS)("放行 %s", (pathname) => {
    expect(isScannerPath(pathname)).toBe(false);
  });
});

describe("坏 UA 签名", () => {
  it("大小写不敏感地命中两个签名", () => {
    expect(isScannerUserAgent("nginx-ssl early hints")).toBe(true);
    expect(isScannerUserAgent("FL2 Early Hints")).toBe(true);
  });

  it("空 UA 放行（健康检查与内部子请求可能不带 UA）", () => {
    expect(isScannerUserAgent(null)).toBe(false);
    expect(isScannerUserAgent("")).toBe(false);
  });

  it("浏览器与爬虫放行", () => {
    expect(isScannerUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false);
    expect(isScannerUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(false);
  });
});

describe("闸门响应", () => {
  it("坏 UA 打首页也回 403", () => {
    const request = new Request("https://blog.wordtk.com/", { headers: { "User-Agent": "fl2 early hints" } });
    const response = scannerResponseFor(request, "/");
    expect(response?.status).toBe(403);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(response?.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("探测路径回 404", async () => {
    const request = new Request("https://blog.wordtk.com/wp-login.php", { headers: { "User-Agent": "Mozilla/5.0" } });
    const response = scannerResponseFor(request, "/wp-login.php");
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Not Found");
  });

  it("正常请求返回 null，继续走站点路由", () => {
    const request = new Request("https://blog.wordtk.com/posts/hello-world", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    expect(scannerResponseFor(request, "/posts/hello-world")).toBeNull();
  });
});
