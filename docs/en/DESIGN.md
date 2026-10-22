# Miao Blog — design notes

> Scope: personal blog on Cloudflare Workers. This document records the decisions that are expensive to reverse,
> and the ones deliberately postponed.

## 1. Positioning

A reader-first personal blog with a browser editor. The target user is someone who currently runs Hexo / Hugo / WordPress
and is tired of the build pipeline or the plugin zoo. The migration path must be short enough to try in ten minutes:

1. deploy (four commands),
2. hand the agent prompt from `/admin/migrate` to your coding agent,
3. keep the URL shape (`/{slug}`).

Everything that does not serve that path was cut: multi-user accounts, memberships, quotas, AI curation, tags hub,
trending pages, real-time collaboration, revision history.

## 2. Architecture

```mermaid
flowchart LR
  U[Browser] -->|HTTPS| CF[Cloudflare edge<br/>static assets first]
  CF -->|miss| W[Worker: Hono app]
  W --> SSR[Hono JSX SSR]
  W --> API[/api/*]
  API --> SVC[services layer]
  SVC --> D1[(D1<br/>posts · comments · sessions)]
  SVC --> R2[(R2<br/>images)]
  SVC --> AI[(Workers AI<br/>optional)]
  W --> CACHE[Cache API]
```

- **One Worker, one domain.** Admin lives at `/admin`; there is no `admin.` subdomain split. A personal blog does not
  need a second DNS record, and the design tokens are shared between both surfaces anyway.
- **Static assets are served before the Worker**, so CSS/SVG/JS do not consume Worker request quota.
- **No KV.** Reads are indexed D1 queries; the Cache API handles hot paths. Removing KV removes one billing surface and
  one binding users have to create.

## 3. Data model

| Table | Purpose | Notes |
| --- | --- | --- |
| `site` | single row (`id = 1`): names, taglines, author profile, theme, comment switch | bilingual fields side by side (`name_zh`, `name_en`) |
| `posts` | metadata + current body | `slug` unique; `status` ∈ draft/published; optional `series_id`; author-settable `published_at` |
| `series` | collections of posts | ordered by `published_at` only — no manual order column |
| `tags` / `post_tags` | controlled tag set | upsert by slug |
| `comments` | flat rows + `root_id` / `parent_id` | two levels only: top-level and replies |
| `sessions` | `sha256(token)` → kind + JSON identity | kinds: `reader` (GitHub) / `admin` |

Deliberate omissions: no `users` table (the author is an env var), no `email` column on comments (privacy),
no `post_revisions` (a blog is not a wiki), no `ai_checks` (AI is optional).

## 4. Identity

**Reader (commenter)** — GitHub OAuth, scope `read:user` only.

- No email is requested or stored.
- `access_token` is used once and discarded.
- Session = 32 random bytes in an httpOnly cookie; the DB stores only its SHA-256.
- Cooldown: 10 seconds between comments per GitHub account.

**Author** — `ADMIN_USER` / `ADMIN_PASS` environment variables, compared in constant time, 5 failed attempts per IP
locks for 15 minutes (in-isolate counter). Cloudflare Access can be layered on top for users who want SSO.

## 5. Language

The UI language is **fixed at deploy time** via `SITE_LOCALE` (`zh` | `en`, default `zh`). There is no runtime switcher.

Why: a personal blog has one audience. A switcher adds a cookie, a redirect route, a header control and two copies of
every page for SEO to disambiguate — for a benefit almost nobody uses. The dictionary still ships both languages
(`src/lib/i18n.ts`), so changing `SITE_LOCALE` and redeploying switches the whole site.

`posts.lang` still exists as a column (kept for historical rows and export), but new posts always take the site language.

## 6. Reading experience

Numbers are chosen, not inherited:

- body 17.5px / line-height 1.9 (Chinese comfortable band); 720px measure ≈ 40 CJK characters per line;
- sticky TOC on ≥980px, hidden below (it would otherwise push content off-screen);
- code blocks are dark in **both** themes — a light-on-light code block reads as dimmed body text;
- `html: false` in markdown-it closes XSS at the source; no sanitizer to keep in sync;
- every body image gets `loading="lazy"` + `decoding="async"`;
- print stylesheet strips chrome and keeps the article.

## 7. Visual system

Two axes, independent:

- `data-theme="light|dark"` — colour. Decided by an inline script before the stylesheet, so no flash.
- `data-color-mode="light|dark|auto"` — chosen by the author in `/admin/settings`. `auto` lets the reader's system
  decide; when it is `auto` the server omits `data-theme` so the `prefers-color-scheme` block applies even without JS.
  There is no reader-facing toggle and no second "shape": one look, tuned once.

Cuteness is expressed through **geometry and motion** (rounded cards, mascot bobbing, hover lift), not illustration.
Consequence: no hero image, small first-paint cost, and a technical blogger can turn it off with one cookie.

## 8. Comments

- Plain text, escaped server-side, rendered with `white-space: pre-wrap`. No Markdown parser on user input.
- Optional `website` field — this is the independent-blog web-ring ritual (comment → return visit → backlink) and it
  costs one TEXT column.
- Author can hide / delete inline on the article page (no trip to the admin).

## 9. Migration via agents

The file-import UI was removed on purpose. A zip importer is a one-shot, hard-to-debug path that also needs a zip
parser and a front-matter subset maintained by hand. Instead `/admin/migrate` renders a prompt describing the site's
own API, and the user hands that prompt to Codex / Claude / WorkBuddy:

- the agent authenticates through `POST /api/admin/login` (same cookie as the admin UI),
- reads `GET /api/admin/posts`, writes with `POST` / `PUT /api/admin/posts/:id`,
- optionally renders with `POST /api/admin/preview`.

No agent-only protocol, no extra token, no separate permission model — one less surface to keep in sync.

**Export** (`GET /api/admin/export`) stays: a JSON file with site + posts. Moving in must not mean being locked in.

## 10. Known limitations (deliberate)

| Limitation | Why it is acceptable |
| --- | --- |
| No dynamic OG images | Needs a font subset bundled into the Worker; static cover images cover 90% of cases |
| No image upload from the editor toolbar | Upload endpoint exists (`/api/admin/media`), UI wiring is v0.2 |
| No scheduled posts | Not core to "start writing in ten minutes" |
| No spam filtering by default | GitHub login already filters anonymous spam; AI moderation is optional |
| No git-based content | Product decision: D1 keeps the runtime boring |

## 11. Verification

`pnpm check` = `wrangler types` + `tsc --noEmit` + `vitest run`.

Tests cover: i18n key parity, slug generation, word count, Markdown rendering (XSS, fences, TOC, excerpt), and the
profile/tag/date formatting, and the agent prompt builder.
