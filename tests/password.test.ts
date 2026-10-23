import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_PASSWORD,
  PASSWORD_ITERATIONS,
  hashPassword,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "../src/lib/password";

/**
 * 后台密码的哈希与规则。
 *
 * 这些是纯函数（Web Crypto，Node 20+ 原生支持），不需要 workerd，所以直接单测。
 * 入库 / 会话失效那部分由真实浏览器实测覆盖（见交付说明）。
 */
describe("密码哈希", () => {
  it("正确密码能验证通过，错误密码不能", async () => {
    const stored = await hashPassword("MiaoTest2026");
    expect(await verifyPassword("MiaoTest2026", stored)).toBe(true);
    expect(await verifyPassword("MiaoTest2027", stored)).toBe(false);
  });

  it("每次哈希的盐都不同（同一个密码在不同记录里哈希不同）", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    // 两份不同的记录都要能各自验通过
    expect(await verifyPassword("same-password", first)).toBe(true);
    expect(await verifyPassword("same-password", second)).toBe(true);
  });

  it("迭代次数随记录保存，默认 10,000（免费版 10ms CPU 额度内）", async () => {
    const stored = await hashPassword("MiaoTest2026");
    expect(stored.iterations).toBe(PASSWORD_ITERATIONS);
    expect(PASSWORD_ITERATIONS).toBe(10_000);
  });

  it("落库的只有哈希与盐，没有明文密码", async () => {
    const stored = await hashPassword("MiaoTest2026");
    expect(stored.hash).not.toContain("MiaoTest2026");
    expect(stored.salt).not.toContain("MiaoTest2026");
    expect(stored.hash.length).toBeGreaterThan(20);
  });
});

describe("账号与密码规则", () => {
  it("账号只允许字母、数字、下划线、连字符", () => {
    expect(validateUsername("miao")).toBeNull();
    expect(validateUsername("miao_2026")).toBeNull();
    expect(validateUsername("miao!")).toBe("admin.account.error.username_charset");
    // 长度先判：单个汉字先报长度，三个汉字才轮到字符集
    expect(validateUsername("猫")).toBe("admin.account.error.username_length");
    expect(validateUsername("猫咪猫")).toBe("admin.account.error.username_charset");
  });

  it("账号长度 3-32", () => {
    expect(validateUsername("ab")).toBe("admin.account.error.username_length");
    expect(validateUsername("a".repeat(33))).toBe("admin.account.error.username_length");
  });

  it("密码不能是出厂默认值 admin（优先于长度报错）", () => {
    expect(validatePassword(DEFAULT_ADMIN_PASSWORD, "miao")).toBe("admin.account.error.default_password");
  });

  it("密码至少 8 位、不能与账号相同", () => {
    expect(validatePassword("short", "miao")).toBe("admin.account.error.password_short");
    expect(validatePassword("miao", "miao")).toBe("admin.account.error.password_short");
    // 8 位且不等于账号 → 合法
    expect(validatePassword("Miao2026", "miao")).toBeNull();
    // 与账号相同（长度够）→ 单独一条错误
    expect(validatePassword("miaomiao", "miaomiao")).toBe("admin.account.error.same_as_username");
  });
});
