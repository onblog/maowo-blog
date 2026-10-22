<div align="center">

<img src="public/img/favicon.svg" width="92" height="92" alt="Miao Blog" />

# Miao Blog

**A single-author blog for Cloudflare Workers.**
猫窝博客 —— 为读者而生的单人博客系统。

<p>
  <a href="README.zh-CN.md">🇨🇳 中文</a> · 🇺🇸 English
</p>

<p>
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-e8836b" />
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020" />
  <img alt="Storage" src="https://img.shields.io/badge/storage-D1%20%2B%20R2-2c2a26" />
  <img alt="KV" src="https://img.shields.io/badge/KV-not%20required-5f9e7f" />
</p>

</div>

---

## Why another blog engine?

WordPress is heavy. Hexo and Hugo are fast but need a build step, a local toolchain and a deploy pipeline. Ghost is nice but
it is a product, not a file you own. Miao Blog sits in between:

| | WordPress | Hexo / Hugo | **Miao Blog** |
| --- | --- | --- | --- |
| Write in | browser (Gutenberg) | local editor + build | browser, Markdown |
| Publish | PHP + MySQL | static build + deploy | **one click, no build** |
| Hosting | VPS + DB | static host | **Cloudflare Workers (free tier)** |
| Comments | plugin zoo | third-party widget | **built-in, GitHub login** |
| Author accounts | multi-user CMS | n/a | **single author by design** |
| Reader data | cookies, trackers | none | **none — no email stored** |
| Cost | ~$5–20/mo | $0 | **$0 for most blogs** |

It is deliberately **not** a multi-user CMS: one person, one blog, no roles, no permission matrix, no plugin marketplace.
That is the feature.

## Features

- **Markdown writing in the browser.** Server-side rendering with the *same* module the live site uses, so preview equals production.
- **Reader-first reading experience.** 17.5px body, 1.9 line height, 720px measure, sticky table of contents, print stylesheet.
- **Stable numeric URLs.** A post lives at `/{13-digit-timestamp}` and never changes when the title changes.
- **Series (合集).** Group posts into a reading order that is simply publication time — no manual ordering to maintain.
- **Custom publish dates.** Backfill old posts or schedule the date you want; created/updated timestamps stay in the database.
- **Cute by shell, serious by content.** Rounded cards, a hand-drawn cat mascot, and two looks (`cute` / `minimal`) so a
  technical blogger can turn the cuteness off without changing a line of code.
- **Light and dark**, decided before first paint (inline script), following the system until the reader chooses.
- **Comments with GitHub login.** Only `read:user` is requested. **No email is stored.** Optional "your blog URL" field
  keeps the independent-blog web-ring culture (comment → return visit → backlink).
- **Agent-ready API.** `/admin/migrate` shows one copy-pasteable prompt; Codex / Claude / WorkBuddy then write,
  publish and migrate posts through the same `/api/admin/*` endpoints the UI uses — no second protocol.
- **One-click export**: the whole site as JSON. Moving in must not mean being locked in.
- **Deployment = configuration.** Language (`zh` / `en`) and admin credentials are environment variables, not runtime toggles.
- **Only D1 + R2.** No KV, no Queues, no Durable Objects, no crons. Edge cache via the Cache API.
- **SEO for free**: RSS with full content, sitemap, robots, canonical URLs, Open Graph tags.

## Deploy

> Requirements: a Cloudflare account and Node.js 20+.

### 1. Create the resources

```bash
git clone https://github.com/onblog/miao-blog.git
cd miao-blog
pnpm install

npx wrangler d1 create miao-blog-db        # copy the database_id
npx wrangler r2 bucket create miao-blog-media
```

Put the `database_id` into `wrangler.jsonc` (both the top-level and the `production` block).

### 2. Apply the schema

```bash
npx wrangler d1 migrations apply miao-blog-db --remote
```

### 3. Set the secrets

```bash
npx wrangler secret put ADMIN_USER          # e.g. martin
npx wrangler secret put ADMIN_PASS          # long random string
npx wrangler secret put GITHUB_CLIENT_ID    # for comments
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Create a GitHub OAuth App at <https://github.com/settings/developers> with the callback URL
`https://YOUR_DOMAIN/api/auth/github/callback`. GitHub allows **one** callback per app, so create a second app for local
development (`http://127.0.0.1:8789/api/auth/github/callback`).

### 4. Deploy

```bash
npx wrangler deploy --env production
```

Then open `/admin`, sign in with the credentials from step 3, and write your first post.

### Configuration reference

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SITE_URL` | yes | — | Absolute site URL. Derives the OAuth `redirect_uri`. |
| `SITE_LOCALE` | no | `zh` | UI language, **fixed at deploy time**. `zh` or `en`. |
| `ADMIN_USER` | yes | — | `/admin` username. **Secret only** — never put it in `vars` (an empty `vars` entry silently overrides the secret). |
| `ADMIN_PASS` | yes | — | `/admin` password (secret). |
| `GITHUB_CLIENT_ID` | for comments | — | Public value; safe in `vars`. |
| `GITHUB_CLIENT_SECRET` | for comments | — | **Secret.** Never commit it. |
| `ENV` | no | `development` | Set to `production` when deployed. |

Tune the design in `/admin/settings`: site name (zh/en), tagline, author bio, avatar, links, `cute | minimal`, comments on/off.

## Migrate with an agent

Open `/admin/migrate`, copy the prompt, replace `<ADMIN_USER>` / `<ADMIN_PASS>`, and hand it to your agent.
The prompt only describes the site's existing HTTP API — the very endpoints `/admin` itself calls:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Sign in, receive the `miao_admin` cookie |
| `GET` | `/api/admin/posts` | List posts (id, slug, title, status) |
| `GET` | `/api/admin/posts/:id` | Read one post with `content_md` |
| `POST` / `PUT` | `/api/admin/posts` | Create / replace a post |
| `DELETE` | `/api/admin/posts/:id` | Delete a post |
| `POST` | `/api/admin/preview` | Render Markdown to HTML |
| `GET` | `/api/admin/export` | Export every post as JSON |

There is no agent-only protocol and no special token: the agent logs in like the admin page does.

**Export** — `GET /api/admin/export` returns `{ site, posts: [...] }`, the whole site in one JSON file.

## Project structure

```
src/
├── index.ts              Worker entry
├── site.tsx              Hono app: middleware order + route registration
├── lib/                  markdown, i18n, cookies, session, slug, formatting
├── middleware/           request id, guards, request context
├── routes/               pages, admin, api, auth, prefs, media, feed/sitemap
├── services/             posts, comments, site, tags, github
└── views/                SSR components (layout, home, post, admin)
migrations/               D1 schema
public/                   styles.css, app.js, admin.js, mascot + favicon
tests/                    unit tests (vitest)
```

## Design notes

- **No frontend framework.** Hono JSX renders HTML on the edge; ~10KB of vanilla JS handles theme, comments and the editor.
- **No WYSIWYG.** Markdown only — the server is the single renderer, so XSS is closed by `html: false` rather than by a sanitizer.
- **No KV.** Blog reads are one indexed D1 query; the Cache API covers hot paths without a second paid resource.
- **Comments are plain text**, rendered escaped with `white-space: pre-wrap`. No Markdown, no HTML, no injection surface.
- Full rationale: [`docs/en/DESIGN.md`](docs/en/DESIGN.md).

## FAQ

**Multiple authors?** No. Fork it and add a `users` table if you really need it — the schema is deliberately small.

**Git as the content source?** Not supported. Content lives in D1; the agent prompt at `/admin/migrate` covers the migration path.

**Will my comments survive a move?** Comments are part of the export JSON.

**Is Cloudflare required?** Yes, the runtime is Workers with D1 and R2 bindings.

**AI?** An optional Workers AI binding is declared for future comment moderation; with no binding, nothing breaks.

## License

[AGPL-3.0-only](LICENSE).

Commercial use that cannot comply with AGPL (closed-source redistribution, SaaS without publishing modifications)
requires a commercial license — open an issue or contact the maintainer.

---

<div align="center">
Made for readers · 为读者而做 🐾
</div>
