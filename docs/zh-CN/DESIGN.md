# 猫窝博客 —— 设计说明

> 范围：Cloudflare Workers 上的单人博客。本文记录「改起来很贵」的决定，以及刻意推迟的东西。

## 1. 定位

面向读者的个人博客，浏览器里写作。目标用户是正在用 Hexo / Hugo / WordPress、受够了构建流水线或插件动物园的人。
迁移路径必须短到「十分钟能试一下」：

1. 部署（四条命令）；
2. 把 `/admin/migrate` 的提示词丢给 Agent；
3. 地址形态不变（`/{slug}`）。

不服务这条路径的东西全部砍掉：多用户、会员、配额、AI 策展、标签广场、趋势页、实时协作、版本历史。

## 2. 架构

```mermaid
flowchart LR
  U[浏览器] -->|HTTPS| CF[Cloudflare 边缘<br/>静态资源优先]
  CF -->|未命中| W[Worker: Hono 应用]
  W --> SSR[Hono JSX SSR]
  W --> API[/api/*]
  API --> SVC[services 层]
  SVC --> D1[(D1<br/>文章 · 评论 · 会话)]
  SVC --> R2[(R2<br/>图片)]
  SVC --> AI[(Workers AI<br/>可选)]
  W --> CACHE[Cache API]
```

- **单 Worker、单域名**。后台就在 `/admin`，不搞 `admin.` 子域分流：个人博客不需要第二条 DNS 记录，
  而且两边的设计 token 本来就是同一套。
- **静态资源在 Worker 之前返回**，CSS/SVG/JS 不消耗 Worker 请求额度。
- **不用 KV**。读路径是一条走索引的 D1 查询，热路径交给 Cache API；少一个资源就少一处计费面和一处用户要创建的东西。

## 3. 数据模型

| 表 | 作用 | 备注 |
| --- | --- | --- |
| `site` | 单行（`id = 1`）：站名、签名、作者资料、形态、评论开关 | 双语字段并排（`name_zh` / `name_en`） |
| `posts` | 元数据 + 当前正文 | `slug` 唯一；`status` ∈ draft/published；可选 `series_id`；作者可指定 `published_at` |
| `series` | 合集 | 只按 `published_at` 排序，没有手动排序列 |
| `tags` / `post_tags` | 受控标签集 | 按 slug upsert |
| `comments` | 平铺行 + `root_id` / `parent_id` | 只有两层：顶层与回复 |
| `sessions` | `sha256(token)` → 类型 + 身份 JSON | 类型：`reader`（GitHub）/ `admin` |

刻意不建：`users`（作者是环境变量）、评论的 `email` 列（隐私）、`post_revisions`（博客不是 wiki）、
`ai_checks`（AI 是可选能力）。

## 4. 身份

**评论者** —— GitHub OAuth，只申请 `read:user`。

- 不请求、不存储邮箱。
- `access_token` 用完即弃。
- 会话 = 32 字节随机数进 httpOnly Cookie，库里只存它的 SHA-256。
- 同一个 GitHub 账号连续评论冷却 10 秒。

**作者** —— `ADMIN_USER` / `ADMIN_PASS` 环境变量，常量时间比较；同 IP 5 次失败锁 15 分钟（isolate 内存计数）。
想要 SSO 的人可以在前面叠一层 Cloudflare Access。

## 5. 语言

界面语言**在部署时定死**，由 `SITE_LOCALE`（`zh` | `en`，默认 `zh`）决定，没有运行时切换器。

为什么：个人博客只有一种受众。切换器要多一个 Cookie、一个重定向路由、一个顶栏控件，以及每个页面两份 HTML 让
SEO 去消歧 —— 换来一个几乎没人用的功能。字典仍保留两份（`src/lib/i18n.ts`），改 `SITE_LOCALE` 重新部署即整体切换。

`posts.lang` 仍是文章级字段：导入的英文文章要能在中文「上一篇 / 下一篇」里正确排序。

## 6. 阅读体验

这些数字是选的，不是继承来的：

- 正文 17.5px / 行高 1.9（中文舒适区）；720px 行宽 ≈ 每行 40 个汉字；
- ≥980px 显示粘性目录，以下隐藏（否则会把正文挤到屏幕外）；
- 代码块在**两种主题下都是深色** —— 浅底浅字会让代码看起来像被压暗的正文；
- markdown-it `html: false` 从根上关掉 XSS，不需要维护 sanitizer；
- 正文图片统一 `loading="lazy"` + `decoding="async"`；
- 打印样式表去掉一切装饰，只留文章。

## 7. 视觉体系

两个互相独立的轴：

- `data-theme="light|dark"` —— 颜色。由样式表之前的**内联脚本**决定，所以没有闪白。
- `data-style="cute|minimal"` —— 形态。`cute` 用 16–22px 圆角、2px 描边、实色偏移阴影和 mascot；
  `minimal` 收掉圆角、去掉阴影、隐藏 mascot。

「可爱」靠**几何与时序**表达（圆角卡片、mascot 呼吸、hover 上浮），不靠插画。代价与收益：首屏没有大图、
LCP 只有文字，而且技术博主可以用一个 Cookie 关掉它。

## 8. 评论

- 纯文本，服务端转义，`white-space: pre-wrap` 渲染。用户输入不经过 Markdown 解析器。
- 可选的 `website` 字段 —— 这是独立博客圈的互访规矩（评论 → 回访 → 反向链接），成本是一列 TEXT。
- 作者可以在文章页直接隐藏/删除评论，不必进后台。

## 9. 用 Agent 迁移

文件导入 UI 是**故意删掉**的：zip 导入是一次性、难排查的路径，还要自己维护 zip 解析器和 front-matter 子集。
改成 `/admin/migrate` 渲染一段描述本站 API 的提示词，用户把它丢给 Codex / Claude / WorkBuddy：

- Agent 用 `POST /api/admin/login` 登录（和后台页面同一个 Cookie），
- 用 `GET /api/admin/posts` 取 id，用 `POST` / `PUT /api/admin/posts/:id` 写文章，
- 需要时用 `POST /api/admin/preview` 校验排版。

没有「Agent 专用协议」、没有额外 Token、没有第二套权限模型——少一个要同步的面。

**导出**（`GET /api/admin/export`）保留：一个包含站点与全部文章的 JSON 文件。**出得去**是产品承诺，不是恩惠。

## 10. 已知限制（有意为之）

| 限制 | 为什么可以接受 |
| --- | --- |
| 没有动态 OG 图 | 需要把字体子集打进 Worker；静态封面图覆盖 90% 场景 |
| 编辑器工具栏还没有传图按钮 | 上传接口已就绪（`/api/admin/media`），UI 接线放到 v0.2 |
| 没有定时发布 | 与「十分钟开始写」无关 |
| 默认没有反垃圾 | GitHub 登录本身挡掉了匿名垃圾；AI 审核是可选 |
| 不支持 Git 作为内容源 | 产品决定：D1 让运行时保持无聊 |

## 11. 验证

`pnpm check` = `wrangler types` + `tsc --noEmit` + `vitest run`。

测试覆盖：i18n 键对齐、slug 生成、字数统计、Markdown 渲染（XSS、代码块、目录、摘要）
（front-matter、草稿、语言检测）。
