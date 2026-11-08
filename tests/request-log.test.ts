import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

import { requestId, requestLog } from "../src/middleware/request-id";

/** 用固定递增的 Date.now 控制"请求耗时"，避免测试真的等一秒 */
function stubClock(stepMs: number) {
  let now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => {
    now += stepMs;
    return now;
  });
}

function buildApp(response: () => Response) {
  const app = new Hono();
  app.use(requestId);
  app.use(requestLog);
  app.get("/p/:slug", () => response());
  return app;
}

describe("请求日志的语义", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("慢请求记 warn：msg 可区分、带路由模板与耗时", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    stubClock(1500);

    await buildApp(() => new Response("ok")).request("/p/123");

    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(log.mock.calls[0]![0]));
    // message 必须能区分"慢"与"错"，否则面板上只能按 level 猜
    expect(entry.msg).toBe("request.slow");
    expect(entry.level).toBe("warn");
    // route 是模板，聚合时不会把每篇文章拆成一组
    expect(entry.route).toBe("/p/:slug");
    expect(entry.path).toBe("/p/123");
    expect(entry.status).toBe(200);
    expect(entry.ms).toBe(1500);
  });

  it("5xx 记 error，msg 用 request.error", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    stubClock(5);

    await buildApp(() => new Response("boom", { status: 500 })).request("/p/9");

    const entry = JSON.parse(String(log.mock.calls[0]![0]));
    expect(entry.msg).toBe("request.error");
    expect(entry.level).toBe("error");
    expect(entry.status).toBe(500);
  });

  it("又快又成功时什么都不记（免费额度只留给慢的和错的）", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    stubClock(20);

    await buildApp(() => new Response("ok")).request("/p/1");

    expect(log).not.toHaveBeenCalled();
  });
});
