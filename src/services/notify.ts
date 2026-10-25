/**
 * 信鸽（pigeon）通知：后台填好接口地址与 Token 即开启，评论落库后推一条一句话消息。
 *
 * 三条硬约束决定了这里的形状：
 * 1. **地址与 Token 都来自后台配置**，仓库里不出现真实域名；换实例只改数据库。
 * 2. **失败绝不影响评论**：调用方一律 `waitUntil` + 内部 try/catch，只记结构化日志。
 *    通知是旁路能力，不能因为第三方超时就让读者提交失败。
 * 3. **文案只有一句话**：「<站点名>有了新评论」。不带上文章、作者、评论正文 ——
 *    第三方通道只承载一个「该去看看了」的信号，评论内容留在自己站里。
 *
 * 接口契约（pigeon v1）：
 *   POST <endpoint>/api/v1/notify
 *   Authorization: Bearer <token>
 *   { "content": "…" }            // content 必填，title 可选；不传 title 时消息就是这一句
 */

const ENDPOINT_MAX = 300;
const TOKEN_MAX = 200;
/** 信鸽侧是同步转发微信/Telegram，5 秒还没回来就当作失败，不拖住 waitUntil 的收尾。 */
const TIMEOUT_MS = 5_000;

export type NotifySettings = {
  endpoint: string;
  token: string;
  updated_at: number;
};

/** 后台读到的视图：Token 只给「是否已配置」与打码预览，明文永不出后台接口。 */
export type NotifySettingsView = {
  endpoint: string;
  tokenSet: boolean;
  tokenPreview: string;
};

const FALLBACK: NotifySettings = { endpoint: "", token: "", updated_at: 0 };

export async function getNotifySettings(env: Env): Promise<NotifySettings> {
  try {
    const row = await env.DB.prepare(
      "SELECT endpoint, token, updated_at FROM notify_settings WHERE id = 1",
    ).first<NotifySettings>();
    return row ?? FALLBACK;
  } catch {
    // 迁移没跑时后台也不能白屏：就当「未配置」，保存时再靠 INSERT OR REPLACE 建行。
    return FALLBACK;
  }
}

/** Token 打码：保留前 6 位与后 4 位，中间固定省略号。太短就整体打码，不给拼图线索。 */
export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 14) return "•".repeat(Math.min(token.length, 8));
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function toNotifyView(settings: NotifySettings): NotifySettingsView {
  return {
    endpoint: settings.endpoint,
    tokenSet: Boolean(settings.token),
    tokenPreview: maskToken(settings.token),
  };
}

/**
 * 归一化后台填的接口地址：
 * - 空字符串合法，表示「关闭」；
 * - 只接受 https（Token 会随请求头发出去，http 明文传输不可接受）；
 * - 去掉尾斜杠，并**拒绝带查询串 / hash / 已带 /api/v1/notify 的地址**，
 *   后者多半是直接粘贴了完整接口地址，拼出来会变成 /api/v1/notify/api/v1/notify。
 */
export function normalizeEndpoint(
  raw: string,
): { ok: true; value: string } | { ok: false; error: "invalid_endpoint" | "endpoint_https_required" } {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return { ok: true, value: "" };
  if (value.length > ENDPOINT_MAX) return { ok: false, error: "invalid_endpoint" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "invalid_endpoint" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "endpoint_https_required" };
  if (url.search || url.hash) return { ok: false, error: "invalid_endpoint" };
  if (/\/api\/v1\/notify$/.test(url.pathname)) return { ok: false, error: "invalid_endpoint" };

  return { ok: true, value: `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}` };
}

export type NotifyPatch = {
  /** 不传 = 不改；传空字符串 = 关闭 */
  endpoint?: string;
  /** 不传 = 不改；传空字符串 = 清除 Token（关闭） */
  token?: string;
};

export async function saveNotifySettings(
  env: Env,
  patch: NotifyPatch,
): Promise<{ ok: true; settings: NotifySettings } | { ok: false; error: string }> {
  const current = await getNotifySettings(env);
  let endpoint = current.endpoint;
  let token = current.token;

  if (patch.endpoint !== undefined) {
    const normalized = normalizeEndpoint(patch.endpoint);
    if (!normalized.ok) return { ok: false, error: normalized.error };
    endpoint = normalized.value;
  }

  if (patch.token !== undefined) {
    const value = patch.token.trim();
    if (value.length > TOKEN_MAX) return { ok: false, error: "token_too_long" };
    // Token 里出现空白基本是复制时带进了换行/空格，直接拒掉，避免带着坏字符去请求。
    if (/\s/.test(value)) return { ok: false, error: "token_invalid" };
    token = value;
  }

  await env.DB.prepare(
    `INSERT INTO notify_settings (id, endpoint, token, updated_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, token = excluded.token,
                                   updated_at = excluded.updated_at`,
  )
    .bind(endpoint, token, Date.now())
    .run();

  return { ok: true, settings: { endpoint, token, updated_at: Date.now() } };
}

export type NotifyResult =
  | { ok: true; status: number }
  | { ok: false; reason: "unconfigured" | "timeout" | "network" | "http"; status?: number; detail?: string };

/**
 * 真正的投递。返回结构化结果，调用方决定记日志还是回给后台。
 *
 * 刻意**不重试**：信鸽自己有幂等键，但这里没有业务主键可用（一条评论只该推一次），
 * 失败就失败——下一次评论还会再推，博主不会因为漏一条通知而吃亏。
 */
async function deliver(
  endpoint: string,
  token: string,
  siteName: string,
): Promise<NotifyResult> {
  if (!endpoint || !token) return { ok: false, reason: "unconfigured" };

  const url = `${endpoint}/api/v1/notify`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content: `${siteName}有了新评论` }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 只留状态码与截断后的错误体：响应里不会有 Token，但错误体可能回显地址，截断更稳。
      const detail = await response.text().catch(() => "");
      log("warn", "notify.pigeon_http", {
        status: response.status,
        detail: detail.slice(0, 200),
        endpointHost: hostOf(endpoint),
      });
      return { ok: false, reason: "http", status: response.status, detail: detail.slice(0, 200) };
    }

    log("info", "notify.pigeon_sent", { endpointHost: hostOf(endpoint) });
    return { ok: true, status: response.status };
  } catch (error) {
    const aborted = controller.signal.aborted;
    log("warn", aborted ? "notify.pigeon_timeout" : "notify.pigeon_error", {
      endpointHost: hostOf(endpoint),
      error: String(error).slice(0, 200),
    });
    return { ok: false, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** 日志只带主机名，不带完整路径与 Token —— 地址本身也是运维信息。 */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid";
  }
}

function log(level: "info" | "warn", msg: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, msg, ...fields }));
}

/**
 * 评论落库后的通知入口：给 `c.executionCtx.waitUntil(...)` 用。
 * 任何异常都吞掉，绝不把「通知失败」变成「评论失败」。
 */
export async function notifyNewComment(env: Env, siteName: string): Promise<void> {
  try {
    const settings = await getNotifySettings(env);
    await deliver(settings.endpoint, settings.token, siteName);
  } catch (error) {
    log("warn", "notify.pigeon_unexpected", { error: String(error).slice(0, 200) });
  }
}

/** 后台「发送测试通知」用：把结果如实回给页面，方便判断是 Token 错还是地址错。 */
export async function sendTestNotification(
  env: Env,
  siteName: string,
): Promise<NotifyResult> {
  const settings = await getNotifySettings(env);
  return deliver(settings.endpoint, settings.token, siteName);
}
