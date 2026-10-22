/**
 * 把 mermaid 打包成一个自包含的 IIFE（public/vendor/mermaid.min.js）。
 *
 * 为什么不走 CDN：自托管站点不该为了一张图表依赖第三方域名的可用性，
 * 而且离线/内网部署时 CDN 直接失效。产物只在含 ```mermaid 的页面按需加载。
 */
import { build } from "esbuild";
import { statSync } from "node:fs";

const started = Date.now();
await build({
  entryPoints: ["src/client/mermaid-boot.mjs"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  outfile: "public/vendor/mermaid.min.js",
});
const bytes = statSync("public/vendor/mermaid.min.js").size;
console.log(
  `public/vendor/mermaid.min.js  ${(bytes / 1024).toFixed(0)} KB  (${Date.now() - started}ms)`,
);
