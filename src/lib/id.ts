/**
 * ULID 生成：48 位时间戳 + 80 位随机，Base32 编码，26 字符。
 * 时间有序 → 主键天然按创建顺序排列，游标分页与索引局部性都好。
 */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let time = now;
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i -= 1) {
    const mod = time % 32;
    out = ENCODING[mod] + out;
    time = (time - mod) / 32;
  }
  return out;
}

function encodeRandom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_LEN));
  let out = "";
  for (const byte of bytes) {
    out += ENCODING[byte % 32];
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  return (encodeTime(now) + encodeRandom()).toLowerCase();
}

/** 短 id：8 字符，用于评论等不需要时间序的场景 */
export function shortId(): string {
  return ulid().slice(-8);
}
