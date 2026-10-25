import { describe, expect, it } from "vitest";

import {
  MAX_PASS_BYTES,
  TARGET_ICON_PX,
  dedupeCandidates,
  extractSingleFrameIco,
  parseIconLinks,
  pickIcoFrame,
  sniffImageType,
  toIconPayload,
} from "../src/lib/favicon";

/**
 * 这一组测试钉死过一次线上事故：
 * wordtk.com 的 favicon.ico 是 6 帧、370 KB 的多尺寸容器，
 * 旧实现用「响应体积 > 200 KB 就丢掉」把它判成了抓取失败，友链头像退化成首字母。
 * 现在改成解包取帧，所以体积再大的容器也应该能出一张小图。
 */

function dibFrame(side: number): Uint8Array {
  // 32bpp DIB：40 字节头 + 像素 + AND 掩码；测试不校验内容，长度对得上即可
  const size = 40 + side * side * 4 + side * ((side + 31) >> 3) * 2;
  return new Uint8Array(size).fill(0x7f);
}

function pngFrame(): Uint8Array {
  // 只放 PNG 魔数 + 一点负载，用来验证「PNG 帧直接当 PNG 发」
  const body = new Uint8Array(64).fill(0x11);
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return body;
}

function buildIco(frames: { side: number; data: Uint8Array }[]): Uint8Array {
  const headerSize = 6 + frames.length * 16;
  const total = frames.reduce((sum, frame) => sum + frame.data.byteLength, headerSize);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, frames.length, true);
  let offset = headerSize;
  frames.forEach((frame, index) => {
    const base = 6 + index * 16;
    out[base] = frame.side >= 256 ? 0 : frame.side; // 256 必须写 0
    out[base + 1] = frame.side >= 256 ? 0 : frame.side;
    view.setUint16(base + 4, 1, true); // planes
    view.setUint16(base + 6, 32, true); // bpp
    view.setUint32(base + 8, frame.data.byteLength, true); // dwBytesInRes
    view.setUint32(base + 12, offset, true); // dwImageOffset
    out.set(frame.data, offset);
    offset += frame.data.byteLength;
  });
  return out;
}

/** 复刻线上那个真实容器：16/32/48/64/128/256，合计约 361 KB */
function wordtkLikeIco(): Uint8Array {
  return buildIco(
    [16, 32, 48, 64, 128, 256].map((side) => ({ side, data: dibFrame(side) })),
  );
}

describe("sniffImageType", () => {
  it("按魔数识别常见格式", () => {
    expect(sniffImageType(buildIco([{ side: 16, data: dibFrame(16) }]))).toBe("image/x-icon");
    expect(sniffImageType(pngFrame())).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
      "image/svg+xml",
    );
  });

  it("认不出就算认不出，不瞎猜", () => {
    expect(sniffImageType(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
    expect(sniffImageType(new Uint8Array(3))).toBeNull();
  });
});

describe("pickIcoFrame", () => {
  it("优先取不超过目标尺寸的最大一帧", () => {
    const frame = pickIcoFrame(wordtkLikeIco());
    expect(frame).not.toBeNull();
    expect(frame!.side).toBe(TARGET_ICON_PX);
  });

  it("所有帧都比目标大时，退回最小的一帧", () => {
    const ico = buildIco([128, 256].map((side) => ({ side, data: dibFrame(side) })));
    expect(pickIcoFrame(ico)!.side).toBe(128);
  });

  it("尺寸字段为 0 按 256 处理", () => {
    const ico = buildIco([{ side: 256, data: dibFrame(256) }]);
    expect(pickIcoFrame(ico)!.side).toBe(256);
  });

  it("拒收损坏的容器", () => {
    expect(pickIcoFrame(new Uint8Array(0))).toBeNull();
    expect(pickIcoFrame(new TextEncoder().encode("not an ico at all"))).toBeNull();
    const truncated = wordtkLikeIco().slice(0, 40); // 表头说 6 帧，实际只有 2 帧的空间
    expect(pickIcoFrame(truncated)).toBeNull();
  });
});

describe("extractSingleFrameIco", () => {
  it("370 KB 的容器 → 十几 KB 的单帧 ICO，且结构合法", () => {
    const source = wordtkLikeIco();
    expect(source.byteLength).toBeGreaterThan(300 * 1024); // 先确认样本真的超标

    const payload = extractSingleFrameIco(source);
    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("image/x-icon");
    expect(payload!.body.byteLength).toBeLessThan(32 * 1024);

    // 重新封出来的容器必须自洽：1 个条目、偏移 22、长度 = 内容长度
    const view = new DataView(payload!.body.buffer, payload!.body.byteOffset, payload!.body.byteLength);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(1);
    expect(view.getUint32(18, true)).toBe(22);
    expect(view.getUint32(14, true)).toBe(payload!.body.byteLength - 22);
    expect(payload!.body[6]).toBe(TARGET_ICON_PX); // 宽
    expect(payload!.body[7]).toBe(TARGET_ICON_PX); // 高
  });

  it("PNG 编码的帧直接当 PNG 返回", () => {
    const ico = buildIco([{ side: 256, data: pngFrame() }]);
    const payload = extractSingleFrameIco(ico);
    expect(payload!.type).toBe("image/png");
    expect(sniffImageType(payload!.body)).toBe("image/png");
  });

  it("容器损坏时返回 null，交给上层兜底", () => {
    expect(extractSingleFrameIco(new TextEncoder().encode("garbage"))).toBeNull();
  });
});

describe("toIconPayload", () => {
  it("大 ICO 解包后仍然放过：体积判断看的是输出，不是容器", () => {
    const payload = toIconPayload(wordtkLikeIco());
    expect(payload).not.toBeNull();
    expect(payload!.body.byteLength).toBeLessThan(MAX_PASS_BYTES);
  });

  it("非 ICO 的大图直接放弃（不为一个小头像拉几百 KB）", () => {
    const huge = new Uint8Array(MAX_PASS_BYTES + 1);
    huge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(toIconPayload(huge)).toBeNull();
  });

  it("content-type 撒谎时以魔数为准", () => {
    const payload = toIconPayload(pngFrame(), "text/plain");
    expect(payload!.type).toBe("image/png");
  });

  it("source 既不是图片也不声明 image/* 时拒收", () => {
    expect(toIconPayload(new TextEncoder().encode("<html>hi</html>"), "text/html")).toBeNull();
  });
});

describe("parseIconLinks", () => {
  const page = `<!doctype html><html><head>
    <link rel="mask-icon" href="/mask.svg" color="#000">
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icon-32.png">
    <link rel="icon" type="image/png" sizes="64x64" href="/assets/icon-64.png?v=2">
    <link rel="stylesheet" href="/styles.css">
  </head><body></body></html>`;

  it("挖出声明图标并解析成绝对地址", () => {
    const urls = parseIconLinks(page, "https://example.com/");
    expect(urls).toContain("https://example.com/favicon.ico");
    expect(urls).toContain("https://example.com/apple.png");
    expect(urls).toContain("https://example.com/assets/icon-64.png?v=2");
  });

  it("排除 mask-icon（单色蒙版当头像会全黑）与无关 link", () => {
    const urls = parseIconLinks(page, "https://example.com/");
    expect(urls.some((url) => url.includes("mask.svg"))).toBe(false);
    expect(urls.some((url) => url.includes("styles.css"))).toBe(false);
  });

  it("尺寸接近目标的那一帧排在最前", () => {
    const urls = parseIconLinks(page, "https://example.com/");
    expect(urls[0]).toBe("https://example.com/assets/icon-64.png?v=2");
  });

  it("拒收 javascript: 之类的伪协议", () => {
    const urls = parseIconLinks('<link rel="icon" href="javascript:alert(1)">', "https://example.com/");
    expect(urls).toEqual([]);
  });

  it("base 非法时返回空数组而不是抛错", () => {
    expect(parseIconLinks(page, "not-a-url")).toEqual([]);
  });
});

describe("dedupeCandidates", () => {
  it("保序去重：声明图标与根路径兜底重叠时只留一份", () => {
    expect(
      dedupeCandidates(["https://a.com/favicon.ico", "https://a.com/x.png", "https://a.com/favicon.ico"]),
    ).toEqual(["https://a.com/favicon.ico", "https://a.com/x.png"]);
  });
});
