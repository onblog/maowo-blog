import { describe, expect, it } from "vitest";

import { readPrimaryEmail } from "../src/services/github";

describe("readPrimaryEmail", () => {
  it("优先取 primary + verified", () => {
    expect(
      readPrimaryEmail([
        { email: "old@example.com", primary: false, verified: true },
        { email: "main@example.com", primary: true, verified: true },
      ]),
    ).toBe("main@example.com");
  });

  it("没有标记 primary 时取第一个已验证地址", () => {
    expect(
      readPrimaryEmail([
        { email: "a@example.com", primary: false, verified: true },
        { email: "b@example.com", primary: false, verified: true },
      ]),
    ).toBe("a@example.com");
  });

  it("未验证地址一律不取（避免把随手填的字符串当账号信息）", () => {
    expect(
      readPrimaryEmail([
        { email: "fake@example.com", primary: true, verified: false },
        { email: "real@example.com", primary: false, verified: true },
      ]),
    ).toBe("real@example.com");
  });

  it("全是未验证地址时返回 null", () => {
    expect(readPrimaryEmail([{ email: "fake@example.com", primary: true, verified: false }])).toBe(null);
  });

  it("非数组 / 空数组 / 脏数据返回 null", () => {
    expect(readPrimaryEmail(null)).toBe(null);
    expect(readPrimaryEmail([])).toBe(null);
    expect(readPrimaryEmail({ email: "x@example.com", verified: true })).toBe(null);
    expect(readPrimaryEmail([{ verified: true }])).toBe(null);
  });
});
