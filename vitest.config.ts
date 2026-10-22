import { defineConfig } from "vitest/config";

/**
 * 单元测试跑在 Node 环境：被测的都是纯函数（i18n 字典、front-matter 解析、
 * Markdown 渲染、slug 生成），不需要 workerd。
 * Worker 集成测试另行用 @cloudflare/vitest-pool-workers 配置。
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
