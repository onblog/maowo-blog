/** 常量时间字符串比较：用于 OAuth state 校验，避免按字节比较泄露时序信息 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  // 长度不同直接判否（长度本身不是秘密，state 长度固定）
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= (left[i] as number) ^ (right[i] as number);
  }
  return diff === 0;
}

/** 只接受站内相对路径，防止 next 参数变成开放重定向 */
export function safeNextPath(next: string | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}
