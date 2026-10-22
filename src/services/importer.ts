/**
 * 一键迁移：把 Hexo / Hugo / Jekyll / 任意 Markdown 目录导入成文章。
 *
 * 支持两种输入：
 *   1. zip 压缩包（站点最常见的导出形态）—— 手写最小 zip 解析器，只处理
 *      stored(0) 与 deflate(8)，依赖运行时自带的 `DecompressionStream`，不引三方库。
 *   2. 纯文本：多个 `---` front-matter 分隔的 .md 拼接内容。
 *
 * 只依赖 Web 标准 API（ArrayBuffer / DataView / TextDecoder / DecompressionStream），
 * 因此在 Workers 与 Node 20+ 里都能跑，测试不需要额外环境。
 */

export type ImportedPost = {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  lang: "zh" | "en";
  tags: string;
  draft: boolean;
  date: number | null;
};

export type ZipEntry = { name: string; data: Uint8Array };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}
function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** 从尾部向前找 EOCD（最多回扫 64KB + 22 字节，zip 注释理论上限） */
function findEocd(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - (0xffff + 22));
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readU32(view, offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/** 解压 zip。条目名统一按 UTF-8 解码（Hexo/Hugo 导出基本都用 UTF-8）。 */
export async function unzip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEocd(view);
  if (eocd === -1) throw new Error("不是有效的 zip 文件");

  const count = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > view.byteLength || readU32(view, offset) !== CENTRAL_SIGNATURE) break;

    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const uncompressedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name && !name.endsWith("/")) {
      // 跳过目录条目
      if (localOffset + 30 <= view.byteLength && readU32(view, localOffset) === LOCAL_SIGNATURE) {
        const localNameLength = readU16(view, localOffset + 26);
        const localExtraLength = readU16(view, localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const raw = bytes.subarray(dataStart, dataStart + compressedSize);

        let data: Uint8Array;
        if (method === 0) {
          data = raw.slice();
        } else if (method === 8) {
          data = await inflateRaw(raw);
        } else {
          // 不支持的压缩方式（bzip2/lzma 等）：跳过而不是整包失败
          data = new Uint8Array(0);
        }
        entries.push({ name, data });
      }
    }

    offset += 46 + nameLength + extraLength + commentLength;
    void uncompressedSize;
  }

  return entries;
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** 把常见的日期写法解析成 Unix 毫秒；解析不出来返回 null */
export function parseDate(input: string | undefined | null): number | null {
  if (!input) return null;
  const trimmed = String(input).trim().replace(/^["']|["']$/g, "");
  // 2024-01-02 12:00:00 / 2024-01-02T12:00:00+08:00 / 2024-01-02
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const ms = Date.parse(normalized);
  if (!Number.isNaN(ms)) return ms;
  const fallback = Date.parse(`${normalized}Z`);
  return Number.isNaN(fallback) ? null : fallback;
}

/**
 * 极简 front-matter 解析：只认 `key: value`、`tags: [a, b]` 与
 * `tags:\n  - a` 这三种最常见形态。认不出的行忽略，正文照常保留。
 */
export function parseFrontMatter(text: string): { data: Record<string, string>; body: string } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };

  const rawFront = match[1] ?? "";
  const body = text.slice(match[0].length);
  const data: Record<string, string> = {};
  let currentKey: string | null = null;
  const arrayBuffer: string[] = [];

  const flushArray = () => {
    if (currentKey && arrayBuffer.length > 0) {
      data[currentKey] = arrayBuffer.join(", ");
      arrayBuffer.length = 0;
    }
  };

  for (const line of rawFront.split(/\r?\n/)) {
    const itemMatch = /^\s*-\s+(.*)$/.exec(line);
    if (itemMatch && currentKey) {
      arrayBuffer.push(String(itemMatch[1]).trim());
      continue;
    }
    flushArray();
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) {
      currentKey = null;
      continue;
    }
    const key = String(kv[1]).toLowerCase();
    const value = String(kv[2]).trim().replace(/^["']|["']$/g, "");
    currentKey = value === "" ? key : null;
    if (value !== "") data[key] = value;
  }
  flushArray();

  return { data, body };
}

/** 判断正文语言：汉字占比 > 15% 视为中文 */
export function detectLang(text: string): "zh" | "en" {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (cjk === 0) return "en";
  return cjk / Math.max(1, cjk + letters / 2) > 0.15 ? "zh" : "en";
}

/**
 * 把一个 Markdown 文件解析成文章。
 * 标题优先级：front-matter.title → 一级标题 → 文件名。
 */
export function parseMarkdownFile(fileName: string, text: string): ImportedPost | null {
  const { data, body } = parseFrontMatter(text);
  const baseName = fileName.replace(/^.*\//, "").replace(/\.(md|markdown|mdx)$/i, "");

  const h1 = /^#\s+(.+)$/m.exec(body);
  const title = (data.title || h1?.[1] || baseName).trim().replace(/^["']|["']$/g, "");
  if (!title) return null;

  const content = h1 && !data.title ? body.replace(/^#\s+.+$/m, "").replace(/^\s*\n/, "") : body;

  const tagsRaw = data.tags || data.categories || "";
  const tags = tagsRaw
    .replace(/^\[|\]$/g, "")
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");

  const draftFlag = (data.draft ?? data.published ?? "").toLowerCase();
  const draft = draftFlag === "true" || draftFlag === "no" || draftFlag === "false";
  const date = parseDate(data.date || data.published || data.pubdate);

  return {
    title: title.slice(0, 200),
    slug: (data.slug || data.permalink || baseName).replace(/^\/|\/$/g, "").slice(0, 80),
    content,
    excerpt: (data.excerpt || data.description || data.summary || "").slice(0, 300),
    lang: (data.lang === "en" || data.lang === "zh" ? data.lang : detectLang(content)) as "zh" | "en",
    tags,
    draft,
    date,
  };
}

/** 收件箱式解析：目录里所有 .md 文件 → 文章列表 */
export async function parseZip(buffer: ArrayBuffer): Promise<ImportedPost[]> {
  const entries = await unzip(buffer);
  const decoder = new TextDecoder("utf-8");
  const posts: ImportedPost[] = [];
  for (const entry of entries) {
    if (!/\.(md|markdown)$/i.test(entry.name)) continue;
    if (entry.data.length === 0) continue;
    const parsed = parseMarkdownFile(entry.name, decoder.decode(entry.data));
    if (parsed) posts.push(parsed);
  }
  return posts;
}

/** 文本模式：用 `\n---\n` 分隔多个文件内容（单文件也适用） */
export function parsePlain(text: string): ImportedPost[] {
  const blocks = text.split(/\r?\n(?=---\r?\n)/);
  const posts: ImportedPost[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const parsed = parseMarkdownFile("pasted.md", trimmed);
    if (parsed) posts.push(parsed);
  }
  return posts.length > 0 ? posts : [parseMarkdownFile("pasted.md", text)].filter(Boolean) as ImportedPost[];
}
