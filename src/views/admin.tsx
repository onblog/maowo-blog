import type { Child } from "hono/jsx";
import type { AdminUser, CommentRow, Locale, PostRow, SiteRow, ColorMode } from "../types";
import { t } from "../lib/i18n";
import { sensitiveSummaryText } from "../lib/sensitive-words";
import { Mascot, MoonIcon, siteName, SunIcon } from "./layout";
import { THEME_BOOT_SCRIPT } from "../lib/theme";
import { ASSET_VERSION } from "../lib/brand";
import { formatDate } from "./format";
import type { SensitiveWordStats } from "../services/sensitive-words";
import type { NotifySettingsView } from "../services/notify";

type Shell = {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser | null;
  active: "posts" | "comments" | "settings" | "account" | "migrate" | "login";
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
    { key: "account", href: "/admin/account", label: "admin.tab.account" },
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
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="stylesheet" href={`/styles.css?v=${ASSET_VERSION}`} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body class="admin-body">
        <header class="admin-header">
          <a class="brand" href="/">
            <Mascot size={26} />
            <span class="brand__name">{name}</span>
          </a>
          <div class="admin-header__actions">
            <button
              class="icon-btn"
              type="button"
              data-theme-toggle
              title={t(locale, "theme.to_dark")}
              aria-label={t(locale, "theme.to_dark")}
            >
              <span class="theme-icon theme-icon--moon">
                <MoonIcon />
              </span>
              <span class="theme-icon theme-icon--sun">
                <SunIcon />
              </span>
            </button>
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
        <script src={`/export-zip.js?v=${ASSET_VERSION}`} defer />
        <script src={`/admin.js?v=${ASSET_VERSION}`} defer />
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

      {posts.length > 0 ? (
        <div class="admin-filters" data-post-filters>
          <div class="filter-select" data-filter-select data-filter-status>
            <button class="filter-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
              <span data-filter-label>{t(locale, "admin.filter.all_status")}</span>
              <svg class="filter-select__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <ul class="filter-select__menu" role="listbox" hidden>
              <li class="filter-select__option filter-select__option--active" role="option" data-value="">
                {t(locale, "admin.filter.all_status")}
              </li>
              <li class="filter-select__option" role="option" data-value="published">
                {t(locale, "admin.dashboard.published")}
              </li>
              <li class="filter-select__option" role="option" data-value="draft">
                {t(locale, "admin.dashboard.draft")}
              </li>
            </ul>
          </div>

          <div class="filter-select" data-filter-select data-filter-year>
            <button class="filter-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
              <span data-filter-label>{t(locale, "admin.filter.all_years")}</span>
              <svg class="filter-select__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <ul class="filter-select__menu" role="listbox" hidden>
              <li class="filter-select__option filter-select__option--active" role="option" data-value="">
                {t(locale, "admin.filter.all_years")}
              </li>
            </ul>
          </div>

          <span class="admin-filter__count" data-filter-count data-template={t(locale, "admin.filter.count")} />
        </div>
      ) : null}

      {posts.length === 0 ? (
        <p class="muted">{t(locale, "admin.dashboard.empty")}</p>
      ) : (
        <ul class="admin-posts">
          {posts.map((post) => {
            const tag = post.status === "published" ? t(locale, "admin.dashboard.published") : t(locale, "admin.dashboard.draft");
            return (
              <li
                class="admin-post"
                data-post-row
                data-status={post.status}
                data-year={String(new Date(post.published_at ?? post.created_at).getUTCFullYear())}
              >
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
                    <a class="btn btn--ghost btn--sm" href={`/p/${post.slug}`} target="_blank" rel="noopener">
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
            {/*
              已发布的文章才有「查看文章」：草稿在前台是 404，放个按钮只会点出一个错误页。
              新标签页打开 —— 编辑器里可能还有未保存的改动，跳走就丢了。
            */}
            {post?.status === "published" ? (
              <a class="btn btn--ghost" href={`/p/${post.slug}`} target="_blank" rel="noopener">
                {t(locale, "admin.editor.view")}
              </a>
            ) : null}
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
          {/*
            拷贝源码：写文章时最常做的「搬出去」动作（公众号 / 掘金 / 知乎 / 其他博客）。
            · MD：Markdown 原文，给支持 Markdown 的平台；
            · 富文本：公众号专用 —— 公众号会剥掉 class 与外部样式，所以服务端把样式全部内联，
              外链折叠成文末脚注，前端以 text/html 写进剪贴板，粘贴即保留排版。
            两者都会把图片与站内链接改成当前访问地址的绝对 URL；只读编辑器里的内容，不要求先保存。
          */}
          <button
            class="tool tool--copy"
            type="button"
            data-copy-source="md"
            title={t(locale, "admin.tool.copy_md")}
            aria-label={t(locale, "admin.tool.copy_md")}
          >
            MD
          </button>
          <button
            class="tool tool--copy tool--copy-text"
            type="button"
            data-copy-source="wechat"
            title={t(locale, "admin.tool.copy_wechat")}
            aria-label={t(locale, "admin.tool.copy_wechat")}
          >
            {t(locale, "admin.tool.copy_wechat_label")}
          </button>
          <span class="tool-sep" aria-hidden="true" />
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
                title={t(locale, "admin.editor.published_at")}
              />
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
  sensitiveWords,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
  comments: Array<CommentRow & { post_title: string | null; post_slug: string | null }>;
  sensitiveWords: SensitiveWordStats;
}) {
  return (
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="comments">
      <div class="admin-section-head">
        <h1 class="admin-title">{t(locale, "admin.comments.title")}</h1>
        {/*
          敏感词是评论的配套设置，放在这个页面的右上角，而不是散在「设置」里：
          维护词表的人此刻正看着评论，入口和它管的东西在同一个屏幕上。
          点开是弹窗，看完就关，不占列表空间。
        */}
        <button class="btn" type="button" data-sensitive-open>
          {t(locale, "admin.sensitive.open")}
        </button>
      </div>
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

      {/*
        评论敏感词：整份覆盖式维护。词表不进仓库（政治/色情词不适合公开分发），
        所以这里是唯一的维护入口；上传即覆盖、立即生效，命中即拒绝评论。
        刻意**不展示词表内容**：它不是给人读的，也不需要在这里编辑 ——
        要改就下载、改完再上传覆盖。所以弹窗里只有统计 + 三个动作。
      */}
      <dialog class="sensitive-dialog" data-sensitive-dialog>
        <div class="sensitive-dialog__body" data-sensitive-words>
          <div class="sensitive-dialog__head">
            <h2 class="sensitive-dialog__title">{t(locale, "admin.sensitive.title")}</h2>
            <button
              class="sensitive-dialog__close"
              type="button"
              data-sensitive-close
              title={t(locale, "admin.sensitive.close")}
              aria-label={t(locale, "admin.sensitive.close")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p class="muted sensitive-dialog__summary" data-sensitive-summary>
            {sensitiveSummaryText(locale, sensitiveWords)}
          </p>
          <div class="sensitive-panel__actions">
            <input type="file" accept=".txt,text/plain" data-sensitive-file hidden />
            <button class="btn btn--primary" type="button" data-sensitive-upload>
              {t(locale, "admin.sensitive.upload")}
            </button>
            <a class="btn btn--ghost" href="/api/admin/sensitive-words/export" download="sensitive-words.txt">
              {t(locale, "admin.sensitive.download")}
            </a>
            <button class="btn btn--ghost" type="button" data-sensitive-clear>
              {t(locale, "admin.sensitive.clear")}
            </button>
            <p class="editor__status" data-sensitive-status />
          </div>
          <p class="muted sensitive-panel__hint">{t(locale, "admin.sensitive.hint")}</p>
        </div>
      </dialog>
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
  // 圆形（头像）把小预览放在输入框同一行，避免它单独占一行把网格撑高；
  // 封面这类大图仍放在下方展示。
  //
  // 有图时缩略图右上角浮一个删除按钮：此前只能靠手改地址栏里的 URL 才能撤掉封面。
  // 按钮常驻 DOM，由 `data-has-image` 控制显示 —— 上传成功后只换 <img>，不再清空容器。
  const removeButton = (
    <button
      class="image-field__remove"
      type="button"
      data-remove-image
      title={t(locale, "admin.editor.image_remove")}
      aria-label={t(locale, "admin.editor.image_remove")}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
    </button>
  );

  return (
    <div class={`field image-field${rounded ? " image-field--inline" : ""}`} data-has-image={value ? "1" : "0"}>
      <span class="field__label">{label}</span>
      <div class="image-field__row">
        <input class="field__input" name={name} value={value ?? ""} placeholder="https://…" data-image-url />
        <button class="btn btn--sm" type="button" data-upload-image>
          {t(locale, "admin.settings.upload")}
        </button>
        {rounded ? (
          <span class="image-field__thumb-wrap">
            <span class="image-field__thumb" data-image-preview>
              {value ? <img src={value} alt="" /> : null}
            </span>
            {removeButton}
          </span>
        ) : null}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
          hidden
          data-image-file
        />
      </div>
      {rounded ? null : (
        <div class="image-field__preview" data-image-preview>
          {value ? <img src={value} alt="" /> : null}
          {removeButton}
        </div>
      )}
    </div>
  );
}

export function AdminSettingsPage({
  site,
  locale,
  colorMode,
  admin,
  notify,
}: {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  admin: AdminUser;
  notify: NotifySettingsView;
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

      {/*
        信鸽通知：单独一块、独立保存，不进上面的站点表单。
        理由：Token 是敏感值，没必要跟着每次「保存设置」在请求体里多走一趟；
        而且站点表单的按钮语义是「保存设置」，混进通知字段会让人以为两件事一起存。
      */}
      <section class="links-editor" data-notify>
        <div class="links-editor__head">
          <div>
            <h2 class="links-editor__title">{t(locale, "admin.settings.notify_title")}</h2>
            <p class="muted links-editor__hint">
              {t(locale, "admin.settings.notify_hint", { site: site.name })}
            </p>
          </div>
          <span class="muted" data-notify-state>
            {notify.tokenSet && notify.endpoint
              ? t(locale, "admin.settings.notify_on")
              : t(locale, "admin.settings.notify_off")}
          </span>
        </div>
        <div class="admin-form__grid">
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.notify_endpoint")}</span>
            <input
              class="field__input"
              type="url"
              placeholder={t(locale, "admin.settings.notify_endpoint_placeholder")}
              value={notify.endpoint}
              data-notify-endpoint
            />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.notify_token")}</span>
            <input
              class="field__input"
              type="password"
              placeholder={
                notify.tokenSet
                  ? `${notify.tokenPreview} · ${t(locale, "admin.settings.notify_token_placeholder")}`
                  : "pg_…"
              }
              data-notify-token
            />
          </label>
        </div>
        <div class="admin-form__actions">
          <p class="editor__status" data-notify-status />
          <button class="btn btn--ghost" type="button" data-notify-test>
            {t(locale, "admin.settings.notify_test")}
          </button>
          <button class="btn btn--ghost" type="button" data-notify-clear>
            {t(locale, "admin.settings.notify_clear")}
          </button>
          <button class="btn btn--primary" type="button" data-notify-save>
            {t(locale, "admin.settings.notify_save")}
          </button>
        </div>
      </section>

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
          <label class="field">
            <span class="field__label">{t(locale, "admin.settings.link_desc")}</span>
            <input class="field__input" name="link_desc" maxlength={60} placeholder={t(locale, "admin.settings.link_desc_placeholder")} />
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
      <button class="btn" type="button" data-export-zip>
        {t(locale, "admin.migrate.export")}
      </button>
    </AdminShell>
  );
}

/**
 * 账号与安全：后台账号密码存在 D1（迁移 0007），这里就是唯一的修改入口。
 *
 * `admin.mustChange` 为 true 时页面顶部挂一条警示：出厂默认口令 admin/admin 写在
 * 公开仓库里，服务端此时已经拦掉了其他所有后台页面与接口，所以这里不是"提示"而是
 * 唯一的出路。提交逻辑在 public/admin.js 的 `[data-account-form]`。
 */
export function AdminAccountPage({
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
    <AdminShell site={site} locale={locale} colorMode={colorMode} admin={admin} active="account">
      <h1 class="admin-title">{t(locale, "admin.account.title")}</h1>

      {admin.mustChange ? (
        <div class="admin-notice admin-notice--warn" role="alert">
          <strong class="admin-notice__title">{t(locale, "admin.account.must_title")}</strong>
          <p class="admin-notice__body">{t(locale, "admin.account.must_hint")}</p>
        </div>
      ) : (
        <p class="muted admin-migrate__hint">{t(locale, "admin.account.hint")}</p>
      )}

      <form class="admin-form" data-account-form>
        <div class="admin-form__grid">
          <label class="field">
            <span class="field__label">{t(locale, "admin.account.current")}</span>
            <input class="field__input" name="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.account.username")}</span>
            <input class="field__input" name="username" value={admin.username} autocomplete="username" required />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.account.password")}</span>
            <input class="field__input" name="password" type="password" autocomplete="new-password" minlength={8} required />
          </label>
          <label class="field">
            <span class="field__label">{t(locale, "admin.account.confirm")}</span>
            <input class="field__input" name="confirmPassword" type="password" autocomplete="new-password" minlength={8} required />
          </label>
        </div>

        <p class="muted admin-migrate__hint">{t(locale, "admin.account.rule")}</p>
        <p class="editor__status" data-account-status />

        <div class="admin-form__actions">
          <button class="btn btn--primary" type="submit">
            {t(locale, "admin.account.submit")}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
