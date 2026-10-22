import type { Child } from "hono/jsx";
import type { AdminUser, CommentRow, Locale, PostRow, SiteRow, ColorMode } from "../types";
import { t } from "../lib/i18n";
import { Mascot, siteName } from "./layout";
import { formatDate } from "./format";

type Shell = {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser | null;
  active: "posts" | "comments" | "settings" | "migrate" | "login";
  children: Child;
};

/** 后台外壳：与前台共用 token 与字体，但换成「侧栏 + 工作区」布局 */
export function AdminShell({ site, locale, colorMode, admin, active, children }: Shell) {
  const name = siteName(site);
  const tabs: Array<{ key: Shell["active"]; href: string; label: Parameters<typeof t>[1] }> = [
    { key: "posts", href: "/admin", label: "admin.tab.posts" },
    { key: "comments", href: "/admin/comments", label: "admin.tab.comments" },
    { key: "settings", href: "/admin/settings", label: "admin.tab.settings" },
    { key: "migrate", href: "/admin/migrate", label: "admin.tab.migrate" },
  ];

  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme={colorMode === "auto" ? undefined : colorMode}
      data-color-mode={colorMode}
    >
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${t(locale, "admin.login.title")} · ${name}`}</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.documentElement.dataset.colorMode;var t=m==='dark'?'dark':m==='light'?'light':(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body class="admin-body">
        <header class="admin-header">
          <a class="brand" href="/">
            <Mascot size={26} />
            <span class="brand__name">{name}</span>
          </a>
          <div class="admin-header__actions">
            <a class="btn btn--ghost" href="/">
              {locale === "zh" ? "查看站点" : "View site"}
            </a>
            {admin ? (
              <button class="btn btn--ghost" type="button" data-admin-logout>
                {t(locale, "admin.logout")}
              </button>
            ) : null}
            <span class="admin-header__user">{admin?.username ?? "—"}</span>
          </div>
        </header>

        {admin ? (
          <div class="admin-layout">
            <nav class="admin-nav" aria-label="Admin">
              {tabs.map((tab) => (
                <a class={`admin-nav__link${active === tab.key ? " admin-nav__link--active" : ""}`} href={tab.href}>
                  {t(locale, tab.label)}
                </a>
              ))}
            </nav>
            <main class="admin-main">{children}</main>
          </div>
        ) : (
          <main class="admin-main">{children}</main>
        )}
        <script src="/admin.js" defer />
      </body>
    </html>
  );
}

export function AdminLoginPage({ site, locale, colorMode }: Omit<Shell, "children" | "admin" | "active">) {
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={null} active="login">
      <div class="admin-login">
        <h1 class="admin-login__title">{t(locale, "admin.login.title")}</h1>
        <p class="admin-login__hint">{t(locale, "admin.login.hint")}</p>
        <form class="admin-login__form" data-login-form>
          <label class="field">
            <span class="field__label">{t(locale, "admin.login.user")}</span>
            <input class="field__input" name="username" autocomplete="username" required />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.login.pass")}</span>
            <input class="field__input" name="password" type="password" autocomplete="current-password" required />
          </label>
          <p class="form-error" data-form-error />
          <button class="btn btn--primary btn--full" type="submit">
            {t(locale, "admin.login.submit")}
          </button>
        </form>
      </div>
    </AdminShell>
  );
}

export function AdminPostsPage({
  site,
  locale,
  colorMode,
  admin,
  posts,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
  posts: PostRow[];
}) {
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="posts">
      <div class="admin-section-head">
        <h1 class="admin-title">{t(locale, "admin.dashboard.title")}</h1>
        <a class="btn btn--primary" href="/admin/new">
          {t(locale, "admin.dashboard.new")}
        </a>
      </div>

      {posts.length === 0 ? (
        <p class="muted">{t(locale, "admin.dashboard.empty")}</p>
      ) : (
        <ul class="admin-posts">
          {posts.map((post) => {
            const tag = post.status === "published" ? t(locale, "admin.dashboard.published") : t(locale, "admin.dashboard.draft");
            return (
              <li class="admin-post">
                <div class="admin-post__main">
                  <a class="admin-post__title" href={`/admin/edit/${post.id}`}>
                    {post.title}
                  </a>
                  <div class="admin-post__meta">
                    <span class={`status-badge status-badge--${post.status}`}>{tag}</span>
                    <span>/{post.slug}</span>
                    <span>
                      {post.published_at
                        ? formatDate(post.published_at, locale)
                        : t(locale, "admin.dashboard.unpublished")}
                    </span>
                    <span>{t(locale, "post.views", { n: post.views })}</span>
                  </div>
                </div>
                <div class="admin-post__actions">
                  {post.status === "published" ? (
                    <a class="btn btn--ghost btn--sm" href={`/${post.slug}`} target="_blank" rel="noopener">
                      {t(locale, "admin.editor.view")}
                    </a>
                  ) : null}
                  <a class="btn btn--ghost btn--sm" href={`/admin/edit/${post.id}`}>
                    {t(locale, "admin.edit")}
                  </a>
                  <button
                    class="btn btn--danger btn--sm"
                    type="button"
                    data-delete-post={post.id}
                    data-confirm={t(locale, "admin.dashboard.delete_confirm")}
                  >
                    {t(locale, "admin.comments.delete")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}

export function AdminEditorPage({
  site,
  locale,
  colorMode,
  admin,
  post,
  tags,
  seriesName,
  seriesNames,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
  post: PostRow | null;
  tags: string;
  seriesName: string;
  seriesNames: string[];
}) {
  const isNew = post === null;
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="posts">
      <div class="editor-page" data-editor-page data-post-id={post?.id ?? ""}>
        <div class="editor-head">
          <input
            class="editor-title"
            name="title"
            value={post?.title ?? ""}
            placeholder={t(locale, "admin.editor.title_placeholder")}
            aria-label={t(locale, "admin.editor.title")}
          />
          <div class="editor-head__actions">
            <a class="btn btn--ghost" href="/admin">
              {t(locale, "admin.editor.back")}
            </a>
            <button class="btn btn--primary" type="button" data-open-publish>
              {isNew ? t(locale, "admin.editor.publish") : t(locale, "admin.publish.title")}
            </button>
          </div>
        </div>

        <div class="editor-toolbar" role="toolbar" aria-label="Markdown">
          <button class="tool" type="button" data-cmd="bold" title={t(locale, "admin.tool.bold")}>
            <strong>B</strong>
          </button>
          <button class="tool" type="button" data-cmd="italic" title={t(locale, "admin.tool.italic")}>
            <em>I</em>
          </button>
          <button class="tool" type="button" data-cmd="code" title={t(locale, "admin.tool.code")}>
            <span class="tool__mono">`</span>
          </button>
          <span class="tool-sep" aria-hidden="true" />
          <button class="tool" type="button" data-cmd="h2" title={t(locale, "admin.tool.h2")}>
            H2
          </button>
          <button class="tool" type="button" data-cmd="h3" title={t(locale, "admin.tool.h3")}>
            H3
          </button>
          <span class="tool-sep" aria-hidden="true" />
          <button class="tool" type="button" data-cmd="ul" title={t(locale, "admin.tool.ul")}>
            •
          </button>
          <button class="tool" type="button" data-cmd="ol" title={t(locale, "admin.tool.ol")}>
            1.
          </button>
          <button class="tool" type="button" data-cmd="quote" title={t(locale, "admin.tool.quote")}>
            ❝
          </button>
          <button class="tool" type="button" data-cmd="link" title={t(locale, "admin.tool.link")}>
            🔗
          </button>
          <button class="tool" type="button" data-upload-inline title={t(locale, "admin.tool.image")}>
            🖼
          </button>
          <span class="editor-toolbar__spacer" />
          <button class="tool tool--mode" type="button" data-editor-mode-toggle title={t(locale, "admin.editor.mode_toggle")}>
            <span data-mode-icon="split" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.6" />
                <path d="M8 2.5v11" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </span>
            <span data-mode-icon="preview" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z" stroke="currentColor" stroke-width="1.6" />
                <circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </span>
            <span data-mode-icon="write" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 13.5 3 10.8 10.6 3.2a1.6 1.6 0 0 1 2.2 0l.6.6a1.6 1.6 0 0 1 0 2.2L5.2 13 2.5 13.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        <div class="editor-split" data-editor-split data-mode="split">
          <textarea
            class="editor-input"
            name="content_md"
            data-editor-input
            spellcheck={false}
            placeholder={t(locale, "admin.editor.content_placeholder")}
          >
            {post?.content_md ?? ""}
          </textarea>
          <div class="editor-preview prose" data-preview />
        </div>

        <input type="file" hidden data-inline-file accept="image/png,image/jpeg,image/webp,image/gif,image/avif" />
      </div>

      <dialog class="publish-dialog" data-publish-dialog>
        <form class="publish-dialog__form" data-publish-form>
          <h2 class="publish-dialog__title">{t(locale, "admin.publish.title")}</h2>

          <label class="field field--row">
            <input type="checkbox" name="draft" checked={post?.status !== "published"} />
            <span class="field__label">{t(locale, "admin.publish.as_draft")}</span>
          </label>

          <label class="field">
            <span class="field__label">{t(locale, "admin.editor.tags")}</span>
            <input
              class="field__input"
              name="tags"
              value={tags}
              placeholder={t(locale, "admin.editor.tags_placeholder")}
            />
          </label>

          <div class="publish-dialog__grid">
            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.series")}</span>
              <input
                class="field__input"
                name="series"
                value={seriesName}
                list="series-options"
                placeholder={t(locale, "admin.editor.series_placeholder")}
              />
              <datalist id="series-options">
                {seriesNames.map((name) => (
                  <option value={name} />
                ))}
              </datalist>
            </label>

            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.published_at")}</span>
              <input
                class="field__input"
                type="datetime-local"
                name="published_at"
                data-published-at
                data-published-utc={post?.published_at ?? ""}
              />
              <span class="field__hint">{t(locale, "admin.editor.published_at_hint")}</span>
            </label>
          </div>

          <label class="field">
            <span class="field__label">{t(locale, "admin.editor.excerpt")}</span>
            <textarea class="field__input" name="excerpt" rows={2}>
              {post?.excerpt ?? ""}
            </textarea>
          </label>

          <ImageField
            label={t(locale, "admin.editor.cover")}
            name="cover_image"
            value={post?.cover_image ?? null}
            locale={locale}
          />

          <label class="field field--row">
            <input type="checkbox" name="pinned" checked={post?.pinned === 1} />
            <span class="field__label">{t(locale, "admin.editor.pin")}</span>
          </label>

          <p class="editor__status" data-save-status />
          <div class="publish-dialog__actions">
            <button class="btn btn--ghost" type="button" data-publish-cancel>
              {t(locale, "admin.publish.cancel")}
            </button>
            <button class="btn btn--primary" type="submit">
              {t(locale, "admin.publish.save")}
            </button>
          </div>
        </form>
      </dialog>
    </AdminShell>
  );
}

export function AdminCommentsPage({
  site,
  locale,
  colorMode,
  admin,
  comments,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
  comments: Array<CommentRow & { post_title: string | null; post_slug: string | null }>;
}) {
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="comments">
      <h1 class="admin-title">{t(locale, "admin.comments.title")}</h1>
      {comments.length === 0 ? (
        <p class="muted">{t(locale, "admin.comments.empty")}</p>
      ) : (
        <ul class="admin-comments">
          {comments.map((comment) => (
            <li class={`admin-comment${comment.status !== "visible" ? " admin-comment--hidden" : ""}`}>
              <div class="admin-comment__head">
                {comment.avatar_url ? <img class="comment__avatar" src={comment.avatar_url} alt="" width="28" height="28" loading="lazy" /> : null}
                <strong>{comment.display_name || comment.login}</strong>
                <span class="muted">@{comment.login}</span>
                {comment.website ? (
                  <a class="muted" href={comment.website} target="_blank" rel="nofollow ugc noopener">
                    {comment.website}
                  </a>
                ) : null}
                <span class="muted">{formatDate(comment.created_at, locale)}</span>
              </div>
              <p class="admin-comment__body">{comment.body}</p>
              <div class="admin-comment__actions">
                <a class="muted" href={`/${comment.post_slug ?? ""}`} target="_blank" rel="noopener">
                  {comment.post_title ?? t(locale, "admin.comments.post")}
                </a>
                <button class="btn btn--ghost btn--sm" type="button" data-toggle-comment={comment.id} data-next={comment.status === "visible" ? "hidden" : "visible"}>
                  {comment.status === "visible" ? t(locale, "admin.comments.hide") : t(locale, "admin.comments.show")}
                </button>
                <button class="btn btn--danger btn--sm" type="button" data-remove-comment={comment.id}>
                  {t(locale, "admin.comments.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

/** 图片字段：URL 输入 + 一键上传到 R2（`POST /api/admin/media`），后台各处共用这一个组件 */
function ImageField({
  label,
  name,
  value,
  locale,
  rounded = false,
}: {
  label: string;
  name: string;
  value: string | null;
  locale: Locale;
  rounded?: boolean;
}) {
  return (
    <div class="field image-field">
      <span class="field__label">{label}</span>
      <div class="image-field__row">
        <input class="field__input" name={name} value={value ?? ""} placeholder="https://…" data-image-url />
        <button class="btn btn--sm" type="button" data-upload-image>
          {t(locale, "admin.settings.upload")}
        </button>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
          hidden
          data-image-file
        />
      </div>
      <div class={`image-field__preview${rounded ? " image-field__preview--round" : ""}`} data-image-preview>
        {value ? <img src={value} alt="" /> : null}
      </div>
    </div>
  );
}

export function AdminSettingsPage({
  site,
  locale,
  colorMode,
  admin,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
}) {
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="settings">
      <h1 class="admin-title">{t(locale, "admin.settings.title")}</h1>
      <form class="admin-form" data-settings-form>
        <div class="admin-form__grid">
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.name")}</span>
            <input class="field__input" name="name" value={site.name} />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.tagline")}</span>
            <input class="field__input" name="tagline" value={site.tagline} />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.owner_name")}</span>
            <input class="field__input" name="owner_name" value={site.owner_name} />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.color_mode")}</span>
            <select class="field__input" name="color_mode">
              <option value="auto" selected={site.color_mode === "auto"}>
                {t(locale, "admin.settings.color_auto")}
              </option>
              <option value="light" selected={site.color_mode === "light"}>
                {t(locale, "admin.settings.color_light")}
              </option>
              <option value="dark" selected={site.color_mode === "dark"}>
                {t(locale, "admin.settings.color_dark")}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.github")}</span>
            <input class="field__input" name="owner_github" value={site.owner_github ?? ""} placeholder="https://github.com/…" />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.email")}</span>
            <input class="field__input" name="owner_email" value={site.owner_email ?? ""} type="email" />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.location")}</span>
            <input class="field__input" name="owner_location" value={site.owner_location ?? ""} />
          </label>
          <ImageField
            label={t(locale, "admin.settings.avatar")}
            name="owner_avatar"
            value={site.owner_avatar}
            locale={locale}
            rounded
          />
        </div>

        <label class="field">
          <span class="field__label">{t(locale, "admin.settings.owner_bio")}</span>
          <textarea class="field__input" name="owner_bio" rows={4}>
            {site.owner_bio}
          </textarea>
        </label>

        <label class="field">
          <span class="field__label">{t(locale, "admin.settings.seo")}</span>
          <textarea class="field__input" name="seo_description" rows={2}>
            {site.seo_description}
          </textarea>
        </label>

        <section class="links-editor" data-links-editor>
          <div class="links-editor__head">
            <div>
              <h2 class="links-editor__title">{t(locale, "admin.settings.links_title")}</h2>
              <p class="muted links-editor__hint">{t(locale, "admin.settings.links_hint")}</p>
            </div>
            <button class="btn btn--sm" type="button" data-add-link>
              {t(locale, "admin.settings.add_link")}
            </button>
          </div>
          <ul class="links-editor__list" data-links-list />
          <input type="hidden" name="owner_links" value={site.owner_links} />
        </section>

        <div class="admin-form__actions">
          <label class="field field--row">
            <input type="checkbox" name="comments_enabled" checked={site.comments_enabled === 1} />
            <span class="field__label">{t(locale, "admin.settings.comments")}</span>
          </label>
          <p class="editor__status" data-settings-status />
          <button class="btn btn--primary" type="submit">
            {t(locale, "admin.settings.save")}
          </button>
        </div>
      </form>

      <dialog class="link-dialog" data-link-dialog>
        <form method="dialog" class="link-dialog__form" data-link-form>
          <h3 class="link-dialog__title">{t(locale, "admin.settings.add_link")}</h3>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.link_name")}</span>
            <input class="field__input" name="link_name" required maxlength={20} />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.link_url")}</span>
            <input class="field__input" name="link_url" type="url" placeholder="https://" required />
          </label>
          <div class="link-dialog__actions">
            <button class="btn btn--ghost" type="button" data-link-cancel>
              {t(locale, "admin.settings.cancel")}
            </button>
            <button class="btn btn--primary" type="submit">
              {t(locale, "admin.settings.confirm")}
            </button>
          </div>
        </form>
      </dialog>
    </AdminShell>
  );
}

export function AdminMigratePage({
  site,
  locale,
  colorMode,
  admin,
  prompt,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
  prompt: string;
}) {
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="migrate">
      <h1 class="admin-title">{t(locale, "admin.migrate.title")}</h1>
      <p class="muted admin-migrate__hint">{t(locale, "admin.migrate.hint")}</p>

      <div class="agent-prompt">
        <div class="agent-prompt__bar">
          <span class="agent-prompt__label">{t(locale, "admin.migrate.prompt_label")}</span>
          <button class="btn btn--sm" type="button" data-copy-prompt>
            {t(locale, "admin.migrate.copy")}
          </button>
        </div>
        <pre class="agent-prompt__body" data-prompt-content>{prompt}</pre>
      </div>

      <p class="muted admin-migrate__foot">{t(locale, "admin.migrate.footer")}</p>
      <a class="btn" href="/api/admin/export">
        {t(locale, "admin.migrate.export")}
      </a>
    </AdminShell>
  );
}
