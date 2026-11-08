import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMarkdownWithToc } from "../src/lib/markdown";
import { renderPostBody, resetRenderMemo } from "../src/lib/post-render";
import { getSite, invalidateSiteCache } from "../src/services/site";

/**
 * 最小 Cache 替身：Node 测试环境没有 Cache API（CacheStorage 不可用），
 * 而缓存的分层行为恰恰是本次优化的核心，所以用内存实现代替并记录调用次数。
 */
function installFakeCaches() {
  const store = new Map<string, string>();
  const calls = { match: 0, put: 0 };
  const cache = {
    match: async (key: string) => {
      calls.match += 1;
      const text = store.get(key);
      if (text === undefined) return undefined;
      return new Response(text, { headers: { "Content-Type": "application/json" } });
    },
    put: async (key: string, response: Response) => {
      calls.put += 1;
      store.set(key, await response.text());
    },
  };
  Object.defineProperty(globalThis, "caches", {
    value: { open: async () => cache },
    configurable: true,
  });
  return { calls, size: () => store.size };
}

describe("正文渲染缓存", () => {
  beforeEach(() => {
    resetRenderMemo();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "caches");
    resetRenderMemo();
  });

  it("同一版本第二次取值不再渲染（没有第二次写缓存）", async () => {
    const fake = installFakeCaches();
    const post = { id: "p1", updated_at: 100, content_md: "## 标题\n\n正文 **加粗**" };

    const first = await renderPostBody(post);
    const second = await renderPostBody(post);

    expect(second).toEqual(first);
    expect(fake.calls.put).toBe(1);
  });

  it("内存层命中后完全不碰边缘缓存（省掉一次 await）", async () => {
    const fake = installFakeCaches();
    const post = { id: "p1b", updated_at: 100, content_md: "## 标题" };

    await renderPostBody(post);
    const callsAfterFirst = { ...fake.calls };
    await renderPostBody(post);

    expect(fake.calls.match).toBe(callsAfterFirst.match);
    expect(fake.calls.put).toBe(callsAfterFirst.put);
  });

  it("内存层被清空后，同一版本靠边缘缓存命中，不重新渲染", async () => {
    const fake = installFakeCaches();
    const post = { id: "p1c", updated_at: 100, content_md: "## 标题" };

    const first = await renderPostBody(post);
    resetRenderMemo();
    const second = await renderPostBody(post);

    expect(second).toEqual(first);
    expect(fake.calls.put).toBe(1);
  });

  it("updated_at 变了就换 key，必须重新渲染", async () => {
    const fake = installFakeCaches();

    await renderPostBody({ id: "p2", updated_at: 1, content_md: "## 旧标题" });
    await renderPostBody({ id: "p2", updated_at: 2, content_md: "## 新标题" });

    expect(fake.calls.put).toBe(2);
    expect(fake.size()).toBe(2);
  });

  it("边缘缓存不可用时降级为直接渲染，输出与不缓存完全一致", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const source = "## 标题\n\n- 一\n- 二\n\n```ts\nconst a = 1;\n```\n";

    const out = await renderPostBody({ id: "p3", updated_at: 1, content_md: source });

    expect(out).toEqual(renderMarkdownWithToc(source));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("站点资料读缓存", () => {
  afterEach(() => {
    invalidateSiteCache();
  });

  const stubSiteEnv = (siteUrl = "https://blog.example.test/") => {
    const sqls: string[] = [];
    const env = {
      SITE_URL: siteUrl,
      DB: {
        prepare(sql: string) {
          sqls.push(sql);
          return { first: async () => ({ id: 1, name: "猫窝" }) as unknown };
        },
      },
    } as unknown as Env;
    return { env, sqls };
  };

  it("连续读取只打一次 D1", async () => {
    invalidateSiteCache();
    const { env, sqls } = stubSiteEnv();

    await getSite(env);
    await getSite(env);

    expect(sqls).toHaveLength(1);
  });

  it("主动失效后重新读库（后台保存站点资料走这条路径）", async () => {
    invalidateSiteCache();
    const { env, sqls } = stubSiteEnv();

    await getSite(env);
    invalidateSiteCache();
    await getSite(env);

    expect(sqls).toHaveLength(2);
  });

  it("SITE_URL 不同时不复用旧缓存", async () => {
    invalidateSiteCache();
    const first = await getSite(stubSiteEnv().env);
    const second = await getSite(stubSiteEnv("https://other.example.test/").env);

    expect(first.url).toBe("https://blog.example.test");
    expect(second.url).toBe("https://other.example.test");
  });
});
