import { t } from "../lib/i18n";
import type { AdminUser, CommentNode, Locale, PostRow, PostSummary, ReaderUser, SiteRow, ThemeName } from "../types";
import { Layout, siteName } from "./layout";
import { formatDate } from "./format";

type Base = {
  site: SiteRow;
  locale: Locale;
  theme: ThemeName;
  reader: ReaderUser | null;
  admin: AdminUser | null;
};

function CommentItem({
  node,
  locale,
  reader,
  admin,
  postSlug,
  depth = 0,
}: {
  node: CommentNode;
  locale: Locale;
  reader: ReaderUser | null;
  admin: AdminUser | null;
  postSlug: string;
  depth?: number;
}) {
  const isOwner = admin !== null;
  const name = node.display_name || node.login;
  return (
    <li class={`comment${depth > 0 ? " comment--reply" : ""}`} id={`c-${node.id}`}>
      <div class="comment__head">
        {node.avatar_url ? (
          <img class="comment__avatar" src={node.avatar_url} alt="" width="32" height="32" loading="lazy" />
        ) : (
          <span class="comment__avatar comment__avatar--fallback">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div class="comment__who">
          <span class="comment__name">
            {node.website ? (
              <a href={node.website} target="_blank" rel="nofollow ugc noopener noreferrer">
                {name}
              </a>
            ) : (
              name
            )}
          </span>
          <span class="comment__meta">
            <time datetime={new Date(node.created_at).toISOString()}>{formatDate(node.created_at, locale)}</time>
            {isOwner && node.website ? <span class="comment__owner-badge">{t(locale, "comments.owner")}</span> : null}
          </span>
        </div>
      </div>
      <div class="comment__body">{node.body}</div>
      <div class="comment__actions">
        {reader ? (
          <button
            class="comment__reply-btn"
            type="button"
            data-reply-to={node.id}
            data-reply-name={node.login}
          >
            {t(locale, "comments.reply")}
          </button>
        ) : (
          <a class="comment__reply-btn" href={`/api/auth/github/start?next=/${postSlug}`}>
            {t(locale, "comments.login")}
          </a>
        )}
        {isOwner ? (
          <>
            <button class="comment__admin-btn" type="button" data-hide-comment={node.id} data-status={node.status}>
              {node.status === "visible" ? t(locale, "admin.comments.hide") : t(locale, "admin.comments.show")}
            </button>
            <button class="comment__admin-btn comment__admin-btn--danger" type="button" data-delete-comment={node.id}>
              {t(locale, "admin.comments.delete")}
            </button>
          </>
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul class="comment-children">
          {node.children.map((child) => (
            <CommentItem
              node={child}
              locale={locale}
              reader={reader}
              admin={admin}
              postSlug={postSlug}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CommentSection({
  site,
  locale,
  reader,
  admin,
  postSlug,
  comments,
  commentCount,
}: {
  site: SiteRow;
  locale: Locale;
  reader: ReaderUser | null;
  admin: AdminUser | null;
  postSlug: string;
  comments: CommentNode[];
  commentCount: number;
}) {
  const enabled = site.comments_enabled === 1;

  if (!enabled) {
    return (
      <section class="comments" id="comments">
        <h2 class="comments__title">{t(locale, "comments.title")}</h2>
        <p class="muted">{t(locale, "comments.disabled")}</p>
      </section>
    );
  }

  return (
    <section class="comments" id="comments" data-post-slug={postSlug}>
      <h2 class="comments__title">
        {t(locale, "comments.title")}
        <span class="comments__count">{t(locale, "comments.count", { n: commentCount })}</span>
      </h2>

      {reader ? (
        <form class="comment-form" data-comment-form>
          <div class="comment-form__who">
            {reader.avatarUrl ? (
              <img class="comment__avatar" src={reader.avatarUrl} alt="" width="32" height="32" />
            ) : null}
            <span>
              {t(locale, "comments.you")} · <strong>{reader.displayName || reader.login}</strong>
            </span>
            <button class="comment-form__logout" type="button" data-logout>
              {t(locale, "comments.logout")}
            </button>
          </div>
          <input type="hidden" name="parentId" value="" />
          <textarea
            class="comment-form__body"
            name="body"
            rows={4}
            required
            placeholder={t(locale, "comments.placeholder")}
          />
          <input
            class="comment-form__website"
            name="website"
            type="url"
            placeholder={t(locale, "comments.website")}
            value=""
          />
          <div class="comment-form__actions">
            <span class="comment-form__status" data-comment-status />
            <button class="btn btn--primary" type="submit">
              {t(locale, "comments.submit")}
            </button>
          </div>
        </form>
      ) : (
        <div class="comment-login">
          <p>{t(locale, "comments.login_hint")}</p>
          <a class="btn btn--github" href={`/api/auth/github/start?next=/${postSlug}`}>
            {t(locale, "comments.login")}
          </a>
        </div>
      )}

      {comments.length === 0 ? (
        <p class="comments__empty">{t(locale, "comments.empty")}</p>
      ) : (
        <ul class="comment-list">
          {comments.map((node) => (
            <CommentItem node={node} locale={locale} reader={reader} admin={admin} postSlug={postSlug} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function PostPage({
  site,
  locale,
  theme,
  reader,
  admin,
  post,
  html,
  toc,
  prev,
  next,
  comments,
  commentCount,
}: Base & {
  post: PostSummary;
  html: string;
  toc: Array<{ level: number; id: string; text: string }>;
  prev: PostRow | null;
  next: PostRow | null;
  comments: CommentNode[];
  commentCount: number;
}) {
  const name = siteName(site);
  const published = formatDate(post.published_at ?? post.created_at, locale);

  return (
    <Layout
      site={site}
      locale={locale}
      theme={theme}
      reader={reader}
      admin={admin}
      title={post.title}
      description={post.excerpt ?? undefined}
      canonicalPath={`/${post.slug}`}
      ogType="article"
      ogImage={post.cover_image}
      activeNav="post"
    >
      <article class="post">
        <header class="post__head">
          <div class="post__breadcrumb">
            <a href="/">{name}</a>
            <span aria-hidden="true">/</span>
            <span>{post.lang === "zh" ? t(locale, "nav.home") : t(locale, "nav.home")}</span>
          </div>
          <h1 class="post__title">{post.title}</h1>
          <div class="post__meta">
            <time datetime={new Date(post.published_at ?? post.created_at).toISOString()}>{published}</time>
            <span class="dot" aria-hidden="true">·</span>
            <span>{t(locale, "post.reading_time", { n: post.reading_minutes })}</span>
            {post.tags.length > 0 ? (
              <span class="post__tags">
                {post.tags.map((tag) => (
                  <a class="tag-chip" href={`/tags/${tag.slug}`}>
                    #{tag.name}
                  </a>
                ))}
              </span>
            ) : null}
          </div>
          {post.cover_image ? (
            <img class="post__cover" src={post.cover_image} alt={post.cover_alt ?? ""} loading="eager" />
          ) : null}
        </header>

        <div class="post__layout">
          <div class="post__body prose" dangerouslySetInnerHTML={{ __html: html }} />

          {toc.length > 1 ? (
            <aside class="toc" aria-label={t(locale, "post.toc")}>
              <p class="toc__title">{t(locale, "post.toc")}</p>
              <ul class="toc__list">
                {toc.map((item) => (
                  <li class={`toc__item toc__item--h${item.level}`}>
                    <a href={`#${item.id}`}>{item.text}</a>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>

        <footer class="post__foot">
          <div class="post__author">
            {site.owner_avatar ? (
              <img class="post__author-avatar" src={site.owner_avatar} alt="" width="56" height="56" loading="lazy" />
            ) : null}
            <div class="post__author-text">
              <p class="post__author-name">{site.owner_name || name}</p>
              <p class="post__author-bio">
                {site.owner_bio}
              </p>
            </div>
          </div>

          <nav class="post-nav" aria-label="Post navigation">
            {prev ? (
              <a class="post-nav__item" href={`/${prev.slug}`} rel="prev">
                <span class="post-nav__label">← {t(locale, "post.prev")}</span>
                <span class="post-nav__title">{prev.title}</span>
              </a>
            ) : (
              <span />
            )}
            {next ? (
              <a class="post-nav__item post-nav__item--next" href={`/${next.slug}`} rel="next">
                <span class="post-nav__label">{t(locale, "post.next")} →</span>
                <span class="post-nav__title">{next.title}</span>
              </a>
            ) : (
              <span />
            )}
          </nav>

          <CommentSection
            site={site}
            locale={locale}
            reader={reader}
            admin={admin}
            postSlug={post.slug}
            comments={comments}
            commentCount={commentCount}
          />
        </footer>
      </article>
    </Layout>
  );
}
