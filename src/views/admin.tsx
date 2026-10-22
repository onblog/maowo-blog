import type { Child } from "hono/jsx";
import type { AdminUser, CommentRow, Locale, PostRow, SiteRow, ThemeName } from "../types";
import { t } from "../lib/i18n";
import { Mascot, siteName } from "./layout";
import { formatDate } from "./format";

type Shell = {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  admin: AdminUser | null;
  active: "posts" | "comments" | "settings" | "migrate" | "login";
  children: Child;
};

/** 后台外壳：与前台共用 token 与字体，但换成「侧栏 + 工作区」布局 */
export function AdminShell({ site, locale, theme, admin, active, children }: Shell) {
  const name = siteName(site, locale);
  const tabs: Array<{ key: Shell["active"]; href: string; label: Parameters<typeof t>[1] }> = [
    { key: "posts", href: "/admin", label: "admin.tab.posts" },
    { key: "comments", href: "/admin/comments", label: "admin.tab.comments" },
    { key: "settings", href: "/admin/settings", label: "admin.tab.settings" },
    { key: "migrate", href: "/admin/migrate", label: "admin.tab.migrate" },
  ];

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} data-theme="light" data-style={theme}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${t(locale, "admin.login.title")} · ${name}`}</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('miao:color');if(s!=='light'&&s!=='dark'){s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=s;}catch(e){}})();`,
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

export function AdminLoginPage({ site, locale, theme }: Omit<Shell, "children" | "admin" | "active">) {
  return (
    <AdminShell site={site} locale={locale} theme={theme} admin={null} active="login">
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
  theme,
  admin,
  posts,
}: {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  admin: AdminUser;
  posts: PostRow[];
}) {
  return (
    <AdminShell site={site} locale={locale} theme={theme} admin={admin} active="posts">
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
                    <span>{formatDate(post.updated_at, locale)}</span>
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
  theme,
  admin,
  post,
  tags,
}: {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  admin: AdminUser;
  post: PostRow | null;
  tags: string;
}) {
  const isNew = post === null;
  return (
    <AdminShell site={site} locale={locale} theme={theme} admin={admin} active="posts">
      <div class="admin-section-head">
        <h1 class="admin-title">{isNew ? t(locale, "admin.dashboard.new") : t(locale, "admin.editor.title")}</h1>
        <div class="admin-section-head__actions">
          <a class="btn btn--ghost" href="/admin">
            {t(locale, "admin.editor.back")}
          </a>
          <button class="btn" type="button" data-save-post="draft">
            {t(locale, "admin.editor.save_draft")}
          </button>
          <button class="btn btn--primary" type="button" data-save-post="published">
            {t(locale, "admin.editor.publish")}
          </button>
        </div>
      </div>

      <form class="editor" data-post-form data-post-id={post?.id ?? ""}>
        <div class="editor__grid">
          <div class="editor__main">
            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.title")}</span>
              <input class="field__input field__input--title" name="title" value={post?.title ?? ""} required />
            </label>

            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.content")}</span>
              <textarea class="field__input field__input--code" name="content_md" rows={22} spellcheck={false}>
                {post?.content_md ?? ""}
              </textarea>
            </label>

            <div class="editor__preview">
              <p class="editor__preview-title">{t(locale, "admin.editor.preview")}</p>
              <div class="prose" data-preview />
            </div>
          </div>

          <aside class="editor__side">
            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.slug")}</span>
              <input class="field__input" name="slug" value={post?.slug ?? ""} placeholder="auto" />
            </label>

            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.tags")}</span>
              <input class="field__input" name="tags" value={tags} placeholder="Cloudflare, 随笔" />
            </label>

            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.excerpt")}</span>
              <textarea class="field__input" name="excerpt" rows={3}>{post?.excerpt ?? ""}</textarea>
            </label>

            <label class="field">
              <span class="field__label">{t(locale, "admin.editor.cover")}</span>
              <input class="field__input" name="cover_image" value={post?.cover_image ?? ""} />
            </label>

            <label class="field field--row">
              <input type="checkbox" name="pinned" checked={post?.pinned === 1} />
              <span class="field__label">{t(locale, "admin.editor.pin")}</span>
            </label>

            <p class="editor__status" data-save-status />
          </aside>
        </div>
      </form>
    </AdminShell>
  );
}

export function AdminCommentsPage({
  site,
  locale,
  theme,
  admin,
  comments,
}: {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  admin: AdminUser;
  comments: Array<CommentRow & { post_title: string | null; post_slug: string | null }>;
}) {
  return (
    <AdminShell site={site} locale={locale} theme={theme} admin={admin} active="comments">
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

export function AdminSettingsPage({
  site,
  locale,
  theme,
  admin,
}: {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  admin: AdminUser;
}) {
  return (
    <AdminShell site={site} locale={locale} theme={theme} admin={admin} active="settings">
      <h1 class="admin-title">{t(locale, "admin.settings.title")}</h1>
      <form class="admin-form" data-settings-form>
        <div class="admin-form__grid">
          <label class="field">
            <span class="field__label">站点名（中文）</span>
            <input class="field__input" name="name_zh" value={site.name_zh} />
          </label>
          <label class="field">
            <span class="field__label">Site name (English)</span>
            <input class="field__input" name="name_en" value={site.name_en} />
          </label>
          <label class="field">
            <span class="field__label">一句话简介（中文）</span>
            <input class="field__input" name="tagline_zh" value={site.tagline_zh} />
          </label>
          <label class="field">
            <span class="field__label">Tagline (English)</span>
            <input class="field__input" name="tagline_en" value={site.tagline_en} />
          </label>
          <label class="field">
            <span class="field__label">作者名</span>
            <input class="field__input" name="owner_name" value={site.owner_name} />
          </label>
          <label class="field">
            <span class="field__label">头像地址</span>
            <input class="field__input" name="owner_avatar" value={site.owner_avatar ?? ""} />
          </label>
          <label class="field">
            <span class="field__label">GitHub</span>
            <input class="field__input" name="owner_github" value={site.owner_github ?? ""} />
          </label>
          <label class="field">
            <span class="field__label">邮箱</span>
            <input class="field__input" name="owner_email" value={site.owner_email ?? ""} />
          </label>
          <label class="field">
            <span class="field__label">所在城市</span>
            <input class="field__input" name="owner_location" value={site.owner_location ?? ""} />
          </label>
          <label class="field">
            <span class="field__label">界面风格</span>
            <select class="field__input" name="theme">
              <option value="cute" selected={site.theme === "cute"}>cute（猫窝风格）</option>
              <option value="minimal" selected={site.theme === "minimal"}>minimal（极简）</option>
            </select>
          </label>
        </div>

        <label class="field">
          <span class="field__label">作者简介（中文）</span>
          <textarea class="field__input" name="owner_bio_zh" rows={4}>{site.owner_bio_zh}</textarea>
        </label>
        <label class="field">
          <span class="field__label">Author bio (English)</span>
          <textarea class="field__input" name="owner_bio_en" rows={4}>{site.owner_bio_en}</textarea>
        </label>
        <label class="field">
          <span class="field__label">友情链接（JSON：[{`{"label_zh":"博客","label_en":"Blog","url":"https://…"}`}]）</span>
          <textarea class="field__input" name="owner_links" rows={3}>{site.owner_links}</textarea>
        </label>

        <div class="admin-form__actions">
          <label class="field field--row">
            <input type="checkbox" name="comments_enabled" checked={site.comments_enabled === 1} />
            <span class="field__label">允许评论</span>
          </label>
          <p class="editor__status" data-settings-status />
          <button class="btn btn--primary" type="submit">
            {locale === "zh" ? "保存设置" : "Save"}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}

export function AdminMigratePage({
  site,
  locale,
  theme,
  admin,
  prompt,
}: {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  admin: AdminUser;
  prompt: string;
}) {
  return (
    <AdminShell site={site} locale={locale} theme={theme} admin={admin} active="migrate">
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
      <a class="btn btn--ghost" href="/api/admin/export">
        {t(locale, "admin.migrate.export")}
      </a>
    </AdminShell>
  );
}
