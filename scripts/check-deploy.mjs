/**
 * 部署链路自检：Mermaid 图表的产物是 gitignore 的生成物，线上少一份就静默降级成源码。
 * 这个脚本把「部署路径必须负责构建它」钉死，`pnpm check` 会跑。
 *
 * 为什么不写成 vitest 用例：项目的 tsconfig 是 Workers 视角（`types: []`），
 * 没有 node 类型，测试里 import "node:fs" 会直接编译失败。
 */
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// 1) 任何一种 wrangler deploy（本地 / Workers Builds）都必须先打包 mermaid
check(
  read("wrangler.jsonc").includes('"command": "node scripts/build-mermaid.mjs"'),
  "wrangler.jsonc 缺少 build.command（node scripts/build-mermaid.mjs），部署会漏掉 public/vendor/mermaid.min.js",
);

// 2) 构建依赖必须在 dependencies：Workers Builds 可能只装生产依赖
const pkg = JSON.parse(read("package.json"));
for (const name of ["mermaid", "esbuild"]) {
  check(Boolean(pkg.dependencies?.[name]), `${name} 必须放在 dependencies，构建阶段才一定装得上`);
  check(!pkg.devDependencies?.[name], `${name} 不要放在 devDependencies`);
}

// 3) 库加载失败必须报错，不能静默把源码当结果
check(
  read("public/app.js").includes("图表库加载失败"),
  "public/app.js 少了对 mermaid 脚本加载失败的显式报错，线上 404 会被静默吞掉",
);

if (failures.length) {
  console.error("部署链路自检未通过：");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("部署链路自检通过（mermaid 产物构建、依赖位置、加载失败提示）");
