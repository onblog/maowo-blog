import { describe, expect, it } from "vitest";

import { escapeLike, parseQuery, searchPublished } from "../src/services/search";

type Row = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: number | null;
  created_at: number;
  reading_minutes: number;
  content_slice: string | null;
  total: number;
};

function fakeEnv(rows: Row[] = []) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...binds: unknown[]) {
            calls.push({ sql, binds });
            return {
              all: async () => ({ results: rows, success: true, meta: {} }),
            };
          },
        };
      },
    },
  } as unknown as Env;
  return { env, calls };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    slug: "1690000000000",
    title: "Cloudflare D1 入门",
    excerpt: "D1 是 Cloudflare 的 SQLite。",
    published_at: 1_700_000_000_000,
    created_at: 1_690_000_000_000,
    reading_minutes: 5,
    content_slice: "正文里也提到了 D1。",
    total: 1,
    ...overrides,
  };
}

describe("搜索查询归一化", () => {
  it("折叠空白并按词拆分", () => {
    expect(parseQuery("  D1   Cloudflare  ")).toEqual({
      query: "D1 Cloudflare",
      terms: ["D1", "Cloudflare"],
    });
  });

  it("大小写不同视为同一个词", () => {
    expect(parseQuery("d1 D1 d1").terms).toEqual(["d1"]);
  });

  it("最多保留 5 个词", () => {
    expect(parseQuery("a b c d e f g").terms).toHaveLength(5);
  });

  it("按码位截断到 64 字，不会切坏 emoji", () => {
    const { query } = parseQuery("猫".repeat(64) + "🐱");
    expect(Array.from(query)).toHaveLength(64);
  });

  it("空查询没有词", () => {
    expect(parseQuery("   ").terms).toEqual([]);
    expect(parseQuery(null).query).toBe("");
  });
});

describe("LIKE 转义", () => {
  it("把通配符当成普通字符", () => {
    expect(escapeLike("100%_d1\\x")).toBe("100\\%\\_d1\\\\x");
  });
});

describe("searchPublished", () => {
  it("空查询不碰数据库", async () => {
    const { env, calls } = fakeEnv();
    const result = await searchPublished(env, "   ", 8);
    expect(result).toEqual({ query: "", terms: [], total: 0, hits: [] });
    expect(calls).toHaveLength(0);
  });

  it("每个词在标题/摘要/正文/标签四路命中，词之间是 AND", async () => {
    const { env, calls } = fakeEnv([row()]);
    await searchPublished(env, "D1 Cloudflare", 8);

    const sql = calls[0]!.sql;
    expect(sql).toContain("p.status = 'published'");
    expect(sql).toContain("ESCAPE '\\'");
    // 两个词 → 两组 WHERE 条件
    expect(sql.match(/p\.title LIKE/g)).toHaveLength(2);
    expect(sql.match(/EXISTS \(/g)).toHaveLength(2);

    const binds = calls[0]!.binds;
    expect(binds.filter((value) => value === "%D1%")).toHaveLength(4);
    expect(binds.filter((value) => value === "%Cloudflare%")).toHaveLength(4);
    expect(binds[binds.length - 1]).toBe(8);
  });

  it("查询词只走绑定参数，不拼进 SQL", async () => {
    const { env, calls } = fakeEnv();
    await searchPublished(env, "x' OR 1=1 --", 8);
    expect(calls[0]!.sql).not.toContain("OR 1=1");
    expect(calls[0]!.sql).not.toContain("x'");
    expect(calls[0]!.binds).toContain("%x'%");
  });

  it("摘要优先取含关键词的 excerpt", async () => {
    const { env } = fakeEnv([row()]);
    const result = await searchPublished(env, "D1", 8);
    expect(result.hits[0]!.snippet).toContain("D1");
    expect(result.hits[0]!.snippet).not.toContain("正文里也提到了");
  });

  it("excerpt 不含关键词时改取正文切片", async () => {
    const { env } = fakeEnv([
      row({ excerpt: "一篇关于边缘计算的随笔。", content_slice: "……这里第一次出现 D1 数据库……" }),
    ]);
    const result = await searchPublished(env, "D1", 8);
    expect(result.hits[0]!.snippet).toContain("D1");
  });

  it("没有发布时间时用创建时间兜底", async () => {
    const { env } = fakeEnv([row({ published_at: null })]);
    const result = await searchPublished(env, "D1", 8);
    expect(result.hits[0]!.publishedAt).toBe(1_690_000_000_000);
  });

  it("总数来自窗口函数，翻页前就知道一共多少条", async () => {
    const { env } = fakeEnv([row({ total: 12 })]);
    const result = await searchPublished(env, "D1", 8);
    expect(result.total).toBe(12);
  });

  it("limit 被夹在 1..50", async () => {
    const { env, calls } = fakeEnv();
    await searchPublished(env, "D1", 500);
    expect(calls[0]!.binds[calls[0]!.binds.length - 1]).toBe(50);

    const second = fakeEnv();
    await searchPublished(second.env, "D1", 0);
    expect(second.calls[0]!.binds[second.calls[0]!.binds.length - 1]).toBe(1);
  });
});
