<div align="center">

<img src="public/img/favicon.svg" width="92" height="92" alt="猫窝博客" />

# 猫窝博客（Maowo Blog）

**为读者而生的个人独立博客系统，跑在 Cloudflare Workers 上。**

<p>
  🇨🇳 中文 · <a href="README.md">🇺🇸 English</a>
</p>

<p>
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-e8836b" />
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020" />
  <img alt="Storage" src="https://img.shields.io/badge/storage-D1%20%2B%20R2-2c2a26" />
  <img alt="KV" src="https://img.shields.io/badge/KV-不需要-5f9e7f" />
</p>

</div>

![猫窝博客首页](docs/images/home.png)

---

## 为什么再造一个博客系统？

WordPress 太重：PHP + MySQL + 一堆插件。Hexo / Hugo 很快，但要本地工具链、构建、发布流水线。Ghost 好用，但它是个产品，不是一个你能带走的文件。

猫窝博客取中间那条路：

| | WordPress | Hexo / Hugo | **猫窝博客** |
| --- | --- | --- | --- |
| 写作方式 | 浏览器（古腾堡） | 本地编辑器 + 构建 | **浏览器写 Markdown** |
| 发布 | PHP + MySQL | 构建 + 部署 | **点一下就发，无构建** |
| 托管 | VPS + 数据库 | 静态托管 | **Cloudflare Workers（免费额度）** |
| 评论 | 插件生态 | 第三方挂件 | **内置，GitHub 登录** |
| 账号体系 | 多用户 CMS | 无 | **设计上就是单人** |
| 读者数据 | Cookie、统计脚本 | 无 | **不存邮箱，不埋点** |
| 成本 | 5–20 元/月起 | 0 | **大多数博客 0 元** |

它**刻意不是**多用户 CMS：一个人、一个博客，没有角色、没有权限矩阵、没有插件市场。这就是它的卖点。

## 功能

- **浏览器里写 Markdown**。预览由服务端渲染，用的是**与线上同一份模块**——预览即发布。
- **阅读优先的排版**。正文 17.5px / 1.9 行高、720px 行宽、粘性目录、打印样式表。
- **稳定的数字地址**：文章固定在 `/{13位时间戳}`，改标题不会改链接。
- **合集**：把文章归入合集，合集内按发布时间排序——不提供手动排序，少一个要维护的东西。
- **自定义发布时间**：补发旧文或指定日期；创建/更新时间只留在数据库里，不对外展示。
- **可爱为壳，内容为核**。大圆角、手绘猫 mascot，中英混排都调过的阅读排版。只有一套视觉，把它做好就够了。
- **亮 / 暗双色**，在首次绘制前决定（内联脚本），未手动选择时跟随系统。
- **不装统计脚本也有阅读数**：文章页显示「多少人浏览过」。浏览器生成访客 ID，把 `path → visitorId` 存在
  `localStorage`，首次访问才调一次 `POST /api/views`，服务端只对 `posts.views` 做 +1。
  没有 Cookie、没有第三方统计、也没有访客表。
- **方便搬出去**：编辑器可把正文复制成 Markdown（给支持 Markdown 的平台），或复制成**公众号可直接粘贴的富文本**：
  公众号会剥掉 class 与外部样式，所以每个标签都带内联 style；图片与站内链接按**当前访问地址**改成绝对地址，
  非公众号外链收进文末脚注，代码高亮也展开成行内颜色。粘进公众号编辑器排版就还在。上传的图片带跨域响应头且
  **不校验 Referer**，外站引用也能正常加载。正文链接统一新标签页打开，已发布的文章在编辑页多一个「查看文章」入口。
- **评论走 GitHub 登录**，申请 `read:user user:email`：GitHub 身份（`github_id`、login、头像）与账号的**已验证 primary 邮箱**
  一起落进 `users` 表，邮箱只用于账号识别与站务联系（不展示、接口不返回、日志不记录）。每个账号**每天（UTC）最多 10 条评论**，
  另有一道全站每日上限防脚本刷屏。可选「你的博客地址」字段，保留独立博客圈「评论 → 回访 → 反向链接」的老规矩。
- **评论敏感词**：后台「设置 → 评论敏感词」上传一份 txt（每行一个词，`# 政治` 这类行声明分类），命中即拒绝、
  提示「评论包含不当内容」，**不入库、不占额度**。词表存 D1、**不进仓库**（政治/色情词不适合公开分发），
  上限 5000 词；匹配前先去掉空白/标点/全角并转小写，`敏_感 词` 这类变形也拦得住。
- **信鸽通知**：后台「设置 → 信鸽通知」填好接口地址与 Token 即开启，有读者评论时推送一句
  「猫窝博客有了新评论」，**不带上评论正文**。发送失败只记日志、绝不影响评论；「发送测试」按钮
  不用等真人评论就能验证 Token 是否有效。
- **面向 Agent 的接口**：`/admin/migrate` 给一段可复制的提示词，Codex / Claude / WorkBuddy 复制后就能通过
  `/api/admin/*` 写文章、发布、迁移——和后台页面用的是同一套接口，没有第二套协议。
- **一键导出**：整站导出 JSON。进得来，也出得去。
- **部署即配置**：语言（`zh` / `en`）与后台账号密码都是环境变量，不做运行时开关。
- **只依赖 D1 + R2**。没有 KV、没有 Queues、没有定时任务，边缘缓存用 Cache API。
- **自带 SEO**：全文 RSS、sitemap、robots、canonical、Open Graph。

## 部署

> 前置条件：Cloudflare 账号 + Node.js 20+。

### 1. 创建资源

```bash
git clone https://github.com/onblog/maowo-blog.git
cd maowo-blog
pnpm install

npx wrangler d1 create miao-blog-db        # 复制输出的 database_id
npx wrangler r2 bucket create miao-blog-media
```

把 `database_id` 填进 `wrangler.jsonc`（顶层与 `production` 两处）。

### 2. 建表

```bash
npx wrangler d1 migrations apply miao-blog-db --remote
```

### 3. 配置密钥

```bash
npx wrangler secret put GITHUB_CLIENT_ID    # 评论需要
npx wrangler secret put GITHUB_CLIENT_SECRET
```

后台账号**不用配密钥**：它存在 D1 的 `admin_credentials` 表里（迁移 `0007`）。首次打开 `/admin`
时自动播种为 `admin` / `admin`，登录后服务端会强制你先改掉它，其他后台页面与接口才会放行。

在 <https://github.com/settings/developers> 新建 OAuth App，回调地址填
`https://你的域名/api/auth/github/callback`。GitHub 每个 App 只允许一个回调地址，所以本地开发要另建一个
（`http://127.0.0.1:8789/api/auth/github/callback`）。

### 4. 上线

```bash
npx wrangler deploy --env production
```

push 到 `main` 后 Workers Builds 会自动构建并部署，一次大约 **1–3 分钟**。想确认某次 push 有没有
真的上线，看 Dashboard 的 **Workers → maowo-blog → 构建（构建历史）**（每次提交一条构建，带耗时与
失败日志），或 `npx wrangler versions list --name maowo-blog | grep Created | tail -3`。
**不要看 `wrangler deployments list`**：它只反映经它自己创建的部署，Workers Builds 的部署不会刷新这个
列表，用它判断会得到「看起来没触发」的错觉。

`pnpm deploy` 和 Workers Builds 最后都落到 `wrangler deploy`，而它开跑前会先执行 `wrangler.jsonc`
里的 `build.command`：把 Mermaid 打包成 `public/vendor/mermaid.min.js`。这是个**生成物**（3 MB，不进
仓库），但必须在上传静态资源之前就存在 —— 少了它的表现非常安静：每张图都退化成一个代码块，线上没人
会发现。所以这件事交给每次部署自动做，而不是靠谁记得先跑一条命令。需要单独构建时用 `pnpm build`。

打开 `/admin`，用 `admin` / `admin` 登录，按提示改掉账号密码，就可以写第一篇了。

### 环境变量

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `SITE_URL` | 是 | — | 站点绝对地址，决定 OAuth 的 `redirect_uri` |
| `SITE_LOCALE` | 否 | `zh` | **部署时定死**的界面语言：`zh` 或 `en` |
| `GITHUB_CLIENT_ID` | 评论需要 | — | 公开值，可放 `vars` |
| `GITHUB_CLIENT_SECRET` | 评论需要 | — | **secret**，绝不进仓库 |

`SITE_URL` **刻意不写进 `wrangler.jsonc`**：Workers Builds 跑的是不带 `--env production` 的
`wrangler deploy`，顶层 `vars` 里的一切都会被原样盖章到生产上。它只放两处 —— 本地开发在
`.dev.vars`（见 `.dev.vars.example`），生产在 Dashboard 的 Worker 变量里
（Settings → Variables and Secrets）。值是纯文本、不是密钥：

```bash
# 一次性写入线上 Worker（值不落进仓库，之后由 keep_vars 保留）
npx wrangler deploy --var SITE_URL:https://你的域名
```

写错或漏写不会报错，但会静默污染全站：`canonical` / `og:url` / `sitemap.xml` / `robots.txt` 的
Sitemap 行 / RSS 里的链接 / GitHub OAuth 回调地址全都会变成那个值。部署后抽查一句最快：

```bash
curl -s https://你的域名/robots.txt | grep Sitemap   # 应为线上域名
```

`wrangler.jsonc` 开了 `keep_vars`：Dashboard 上设的变量不会被 `wrangler deploy` 覆盖或删除，
所以只需设这一次。

站点**只走自定义域名**：`wrangler.jsonc` 里写死了 `workers_dev: false` 与 `preview_urls: false`。
不写这两行时 wrangler 会自动开启 `*.workers.dev` 和预览 URL，同一份内容就多出两个公开入口。
域名本身仍在 Dashboard → Worker → Settings → Domains & Routes 维护（仓库里不出现真实域名）。

后台账号密码存在 D1（`admin_credentials` 单行表），在 `/admin/account` 页修改，不再走环境变量。
默认的 `admin` / `admin` 第一次登录必须换掉。

站名、签名、头像、友情链接、**颜色模式（`auto` / `light` / `dark`）**、评论开关，都在 `/admin/settings` 里改。

## 用 Agent 迁移

打开 `/admin/migrate`，复制那段提示词，把 `<ADMIN_USER>` / `<ADMIN_PASS>` 换成你的账号密码，交给 Agent 即可。
提示词描述的**只是本站已有的 HTTP 接口**——就是 `/admin` 自己调用的那一批：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | 登录，拿到 `miao_admin` Cookie |
| `GET` | `/api/admin/posts` | 列出文章（id、slug、标题、状态） |
| `GET` | `/api/admin/posts/:id` | 读单篇（含 `content_md`） |
| `POST` / `PUT` | `/api/admin/posts` | 新建 / 覆盖文章 |
| `DELETE` | `/api/admin/posts/:id` | 删除文章 |
| `POST` | `/api/admin/preview` | Markdown 渲染成 HTML |
| `POST` | `/api/admin/copy-source` | 返回 `{ markdown, wechatHtml, wechatText }`，公众号版只用内联样式 |
| `GET` | `/api/admin/export` | 导出全部文章 JSON |
| `POST` | `/api/views` | 公开接口：已发布文章的浏览量 +1（无需登录） |

没有「Agent 专用协议」，也没有额外的 Token：Agent 的登录方式和后台页面完全一样。

**发公众号**：在编辑器里打开文章，点「富文本」，到公众号编辑器里直接粘贴即可。内联样式会在清洗后保留，
外链变成文末脚注，图片是公众号能抓取的绝对地址。暂时只有一套主题，按公众号正文阅读宽度调过。

**导出**：`GET /api/admin/export` 返回 `{ site, posts: [...] }`，整站一个 JSON 文件。

## 目录结构

```
src/
├── index.ts              Worker 入口
├── site.tsx              Hono 应用：中间件顺序 + 路由注册
├── lib/                  Markdown、i18n、Cookie、会话、slug、格式化
├── middleware/           请求 id、守卫、请求上下文
├── routes/               页面、后台、API、OAuth、偏好、图片、feed/sitemap
├── services/             文章、评论、站点、标签、GitHub
└── views/                SSR 组件（布局、首页、文章、后台）
migrations/               D1 schema
public/                   styles.css、app.js、admin.js、mascot 与 favicon
tests/                    单元测试（vitest）
```

## 设计说明

- **不用前端框架**。Hono JSX 在边缘渲染 HTML，约 10KB 原生 JS 负责主题、评论与编辑器。
- **不做富文本**。只有 Markdown——服务端是唯一渲染器，XSS 由 `html: false` 从根上关掉，而不是靠 sanitizer 兜。
- **不用 KV**。博客读路径是一条走索引的 D1 查询，热路径交给 Cache API，少一个收费资源。
- **评论按纯文本渲染**（转义 + `white-space: pre-wrap`），不解析 Markdown/HTML，没有注入面。
- 完整取舍记录见 [`docs/zh-CN/DESIGN.md`](docs/zh-CN/DESIGN.md)。

## 常见问题

**支持多作者吗？** 不支持。真需要就 fork 后自己加 `users` 表，schema 是刻意留小的。

**能拿 Git 仓库当内容源吗？** 不支持。内容在 D1，迁移路径由一键导入覆盖。

**换站会不会丢评论？** 评论在导出 JSON 里，一起走。

**一定要 Cloudflare 吗？** 是，运行时就是 Workers + D1 + R2。

**AI 用在哪？** 目前**没有**用于评论审核：评论区只有 GitHub 登录（真人身份）+ 每账号每日 10 条与全站每日 100 条的限流，
外加一份**由你自己上传**的敏感词表做前置拦截（后台「设置 → 评论敏感词」），不需要再叠一层模型判定。
`wrangler.jsonc` 里保留了一个可选的 Workers AI binding，留给将来自己的扩展，不绑定它也不会崩。

## 许可证

[AGPL-3.0-only](LICENSE)。

无法遵守 AGPL 的商业使用（闭源分发、改了不公开的 SaaS）需要另行获取商业授权——开 issue 说明来意即可。

---

<div align="center">
为读者而做 🐾
</div>
