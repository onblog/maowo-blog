/**
 * 友链图标解析：把第三方站点丢过来的「图标资源」加工成**一枚**能给 <img> 直接用的字节。
 *
 * 存在的理由（踩过的坑）：
 *   很多站点把 16/32/48/64/128/256 六种尺寸打进同一个 .ico 容器里，总体积轻松超过
 *   300 KB（本站友链里的一个站点实测就是 370,070 B）。而页面上这个头像只有 44×44 px，
 *   原样透传等于为了一个小方块拉 361 KB —— 既拖慢页面，也白白烧掉 Workers 出站流量。
 *   所以这里在边缘做一次「容器解包」：解析 ICONDIR，只留最接近显示尺寸的那一帧，
 *   重新封成单帧 ICO（或直接当 PNG 发出去），体积通常从几百 KB 降到十几 KB。
 *
 * 这里的函数全部是纯函数（不碰网络、不碰 Cache），方便单测。
 */

/** 友链卡片头像 44×44 px；取 64 这一帧兼顾清晰度与体积 */
export const TARGET_ICON_PX = 64;

/** 非 ICO 图标的透传上限（PNG/SVG/JPEG 等已是压缩格式，超了说明尺寸离谱，放弃） */
export const MAX_PASS_BYTES = 256 * 1024;

/** ICO 容器的读取上限：解包后只留一帧，所以容器本身可以比输出大得多 */
export const MAX_ICO_CONTAINER_BYTES = 2 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type IconPayload = { body: Uint8Array; type: string };

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** 按魔数判断图片类型：源站的 content-type 经常是错的（text/plain 发 ico 很常见） */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    bytes.byteLength >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // SVG 是文本：只在前 512 字节里找 <svg，避免把整个文件解码成字符串
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512));
  if (/<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

type IcoFrame = { entryOffset: number; offset: number; length: number; side: number };

/**
 * 解析 ICONDIR，挑一帧最合适的：
 *   优先「不超过 TARGET_ICON_PX 的最大一帧」，都不够小就退回最小的一帧。
 */
export function pickIcoFrame(bytes: Uint8Array): IcoFrame | null {
  if (bytes.byteLength < 6) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0) return null; // reserved 必须为 0
  if (view.getUint16(2, true) !== 1) return null; // type 必须为 1（icon）
  const count = view.getUint16(4, true);
  if (count === 0 || count > 32) return null; // 条目数离谱，按损坏处理

  const frames: IcoFrame[] = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    if (entryOffset + 16 > bytes.byteLength) return null;
    const width = bytes[entryOffset] || 256; // 字段为 0 表示 256
    const height = bytes[entryOffset + 1] || 256;
    const length = view.getUint32(entryOffset + 8, true);
    const offset = view.getUint32(entryOffset + 12, true);
    if (length === 0) continue;
    if (offset < 6 || offset + length > bytes.byteLength) continue; // 越界条目跳过
    frames.push({ entryOffset, offset, length, side: Math.max(width, height) });
  }
  if (frames.length === 0) return null;

  const fit = frames
    .filter((frame) => frame.side <= TARGET_ICON_PX)
    .sort((a, b) => b.side - a.side)[0];
  if (fit) return fit;
  return frames.sort((a, b) => a.side - b.side)[0] ?? null;
}

/**
 * 从多帧 ICO 里抽出单独一帧：
 *   - 帧体本身是 PNG（Vista 之后 256×256 的常见做法）→ 直接当 PNG 发；
 *   - 否则重封成「只含一帧」的合法 ICO（复制原 ICONDIRENTRY，只改偏移）。
 */
export function extractSingleFrameIco(bytes: Uint8Array): IconPayload | null {
  const frame = pickIcoFrame(bytes);
  if (!frame) return null;

  if (startsWith(bytes.subarray(frame.offset, frame.offset + 8), PNG_SIGNATURE)) {
    return { body: bytes.slice(frame.offset, frame.offset + frame.length), type: "image/png" };
  }

  const out = new Uint8Array(6 + 16 + frame.length);
  // ICONDIR: reserved=0, type=1, count=1
  out.set([0x00, 0x00, 0x01, 0x00, 0x01, 0x00], 0);
  // ICONDIRENTRY 原样复制（宽高字节为 0 时仍然表示 256，必须保留原值）
  out.set(bytes.subarray(frame.entryOffset, frame.entryOffset + 16), 6);
  out.set(bytes.subarray(frame.offset, frame.offset + frame.length), 22);

  const view = new DataView(out.buffer);
  view.setUint32(14, frame.length, true); // dwBytesInRes
  view.setUint32(18, 22, true); // dwImageOffset：紧跟 6+16 字节头部
  return { body: out, type: "image/x-icon" };
}

/**
 * 规整成可直接响应的图标：ICO 走解包，其它类型按魔数纠正 content-type 并卡体积。
 */
export function toIconPayload(bytes: Uint8Array, declaredType = ""): IconPayload | null {
  const sniffed = sniffImageType(bytes);
  const type = sniffed ?? (declaredType.startsWith("image/") ? declaredType.split(";")[0]! : null);
  if (!type) return null;

  if (type === "image/x-icon") {
    const single = extractSingleFrameIco(bytes);
    if (single) return single;
    // 解包失败（容器损坏但浏览器可能仍能显示）：小文件原样放过，大文件不赌
    return bytes.byteLength <= MAX_PASS_BYTES ? { body: bytes, type } : null;
  }
  if (bytes.byteLength > MAX_PASS_BYTES) return null;
  return { body: bytes, type };
}

/** sizes 属性 → 边长：0 = 未声明，-1 = "any"（通常是 SVG） */
function parseSizes(sizes: string): number {
  const lower = sizes.toLowerCase();
  if (/\bany\b/.test(lower)) return -1;
  let best = 0;
  for (const part of lower.split(",")) {
    const match = /(\d+)\s*[x×]\s*(\d+)/.exec(part);
    if (match) best = Math.max(best, Number(match[1]), Number(match[2]));
  }
  return best;
}

function scoreIcon(rel: string, sizes: string): number {
  const lower = rel.toLowerCase();
  if (!/\bicon\b/.test(lower)) return 0; // rel 里没有 icon 这个词，不认
  if (/\bmask-icon\b/.test(lower)) return 0; // 单色蒙版，拿来当头像会全黑
  const side = parseSizes(sizes);
  if (side === -1) return 220; // sizes="any"：多为 SVG，清晰且通常很小
  if (side === 0) return 200; // 未声明尺寸：多半就是标准 /favicon.ico
  if (side >= TARGET_ICON_PX && side <= 192) return 300 - Math.abs(side - TARGET_ICON_PX);
  if (side > 192) return 150; // 明说过大，下载不划算
  return 80 + side / 2; // 比显示尺寸还小
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1]!.toLowerCase();
    if (attributes[name] !== undefined) continue;
    attributes[name] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return attributes;
}

const MAX_DECLARED_ICONS = 6;

/**
 * 从 HTML 里挖 `<link rel="icon">` 声明的图标地址，按优先级排序后返回绝对 URL。
 *
 * 为什么必须做：现代站点常用 /assets/icon-abc123.png、favicon.svg，
 * 而根目录 /favicon.ico 可能压根不存在 —— 只试根路径会漏掉一大半站点。
 */
export function parseIconLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const found: { url: string; score: number }[] = [];
  const seen = new Set<string>();
  const tagPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const attributes = readAttributes(match[0]);
    const href = attributes.href;
    if (!href) continue;
    const score = scoreIcon(attributes.rel ?? "", attributes.sizes ?? "");
    if (score <= 0) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    resolved.hash = "";
    const url = resolved.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    found.push({ url, score });
  }

  found.sort((a, b) => b.score - a.score);
  return found.slice(0, MAX_DECLARED_ICONS).map((item) => item.url);
}

/** 把候选列表去重（声明图标 + 根路径兜底可能重叠） */
export function dedupeCandidates(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
