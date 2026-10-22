import type { AdminUser, Locale, PostRow, PostSummary, ReaderUser, SiteRow, ColorMode } from "../types";
import { t } from "../lib/i18n";
import type { FriendLink } from "../services/site";
import { Layout } from "./layout";
import { formatDate } from "./format";

type BaseProps = {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  reader: ReaderUser | null;
  admin: AdminUser | null;
};

export function ArchivePage({
  site,
  locale,
  colorMode,
  reader,
  admin,
  groups,
  total,
}: BaseProps & { groups: Array<{ year: string; posts: PostRow[] }>; total: number }) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={t(locale, "archive.title")}
      canonicalPath="/archive"
      activeNav="archive"
    >
      <header class="page-head">
        <h1 class="page-head__title">{t(locale, "archive.title")}</h1>
        <p class="page-head__meta">{t(locale, "archive.count", { n: total })}</p>
      </header>

      {groups.length === 0 ? (
        <p class="muted">{t(locale, "archive.empty")}</p>
      ) : (
        <div class="archive">
          {groups.map((group) => (
            <section class="archive__group">
              <h2 class="archive__year">{group.year}</h2>
              <ul class="archive__list">
                {group.posts.map((post) => (
                  <li class="archive__item">
                    <a class="archive__link" href={`/p/${post.slug}`}>
                      {post.title}
                    </a>
                    <time class="archive__date" datetime={new Date(post.published_at ?? post.created_at).toISOString()}>
                      {formatDate(post.published_at ?? post.created_at, locale)}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Layout>
  );
}

export function TagsPage({
  site,
  locale,
  colorMode,
  reader,
  admin,
  tags,
}: BaseProps & { tags: Array<{ slug: string; name: string; post_count?: number }> }) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={t(locale, "tags.title")}
      canonicalPath="/tags"
      activeNav="tags"
    >
      <header class="page-head">
        <h1 class="page-head__title">{t(locale, "tags.title")}</h1>
        <p class="page-head__meta">{t(locale, "tags.count", { n: tags.length })}</p>
      </header>

      {tags.length === 0 ? (
        <p class="muted">{t(locale, "tags.empty")}</p>
      ) : (
        <div class="tag-cloud">
          {tags.map((tag) => (
            <a class="tag-cloud__item" href={`/tags/${tag.slug}`}>
              <span class="tag-cloud__name">#{tag.name}</span>
              <span class="tag-cloud__count">{tag.post_count ?? 0}</span>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}

export function TagPage({
  site,
  locale,
  colorMode,
  reader,
  admin,
  tagName,
  posts,
}: BaseProps & { tagName: string; posts: PostSummary[] }) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={`#${tagName}`}
      canonicalPath={`/tags/${tagName}`}
      activeNav="tags"
    >
      <header class="page-head">
        <h1 class="page-head__title">#{tagName}</h1>
        <p class="page-head__meta">{t(locale, "tags.count", { n: posts.length })}</p>
      </header>
      <div class="post-list">
        {posts.map((post) => (
          <article class="post-card">
            <h2 class="post-card__title">
              <a href={`/p/${post.slug}`}>{post.title}</a>
            </h2>
            <div class="post-card__meta">
              <time>{formatDate(post.published_at ?? post.created_at, locale)}</time>
            </div>
          </article>
        ))}
      </div>
    </Layout>
  );
}

export function AboutPage({
  site,
  locale,
  colorMode,
  reader,
  admin,
}: BaseProps) {
  const bio = site.owner_bio;
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={t(locale, "about.title")}
      canonicalPath="/about"
      activeNav="about"
    >
      <header class="page-head">
        <h1 class="page-head__title">{t(locale, "about.title")}</h1>
      </header>
      <div class="about">
        {site.owner_avatar ? (
          <img class="about__avatar" src={site.owner_avatar} alt={site.owner_name} width="96" height="96" loading="lazy" />
        ) : null}
        <h2 class="about__name">{site.owner_name}</h2>
        <div class="about__bio prose">
          {bio ? <p>{bio}</p> : <p class="muted">{t(locale, "about.empty")}</p>}
        </div>
        {site.owner_email ? (
          <p class="about__contact">
            {t(locale, "about.contact")}: <a href={`mailto:${site.owner_email}`}>{site.owner_email}</a>
          </p>
        ) : null}
      </div>
    </Layout>
  );
}

export function SeriesListPage({
  site,
  locale,
  colorMode,
  reader,
  admin,
  series,
}: BaseProps & {
  series: Array<{ slug: string; name: string; description: string | null; post_count: number }>;
}) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={t(locale, "series.title")}
      canonicalPath="/series"
      activeNav="series"
    >
      <header class="page-head">
        <h1 class="page-head__title">{t(locale, "series.title")}</h1>
        <p class="page-head__meta">{t(locale, "series.count", { n: series.length })}</p>
      </header>

      {series.length === 0 ? (
        <p class="muted">{t(locale, "series.empty")}</p>
      ) : (
        <div class="series-list">
          {series.map((item) => (
            <a class="series-card" href={`/series/${item.slug}`}>
              <span class="series-card__body">
                <span class="series-card__name">{item.name}</span>
                {item.description ? <span class="series-card__desc">{item.description}</span> : null}
              </span>
              <span class="series-card__meta">{t(locale, "series.posts", { n: item.post_count })}</span>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}

export function SeriesPage({
  site,
  locale,
  colorMode,
  reader,
  admin,
  series,
  posts,
}: BaseProps & {
  series: { slug: string; name: string; description: string | null };
  posts: PostRow[];
}) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={series.name}
      description={series.description ?? undefined}
      canonicalPath={`/series/${series.slug}`}
      activeNav="series"
    >
      <header class="page-head">
        <div>
          <a class="page-head__back" href="/series">
            ← {t(locale, "series.title")}
          </a>
          <h1 class="page-head__title">{series.name}</h1>
          {series.description ? <p class="page-head__desc">{series.description}</p> : null}
        </div>
        <p class="page-head__meta">{t(locale, "series.posts", { n: posts.length })}</p>
      </header>

      <ol class="series-posts">
        {posts.map((post, index) => (
          <li class="series-posts__item">
            <span class="series-posts__index">{index + 1}</span>
            <a class="series-posts__link" href={`/p/${post.slug}`}>
              {post.title}
            </a>
            <time class="series-posts__date" datetime={new Date(post.published_at ?? post.created_at).toISOString()}>
              {formatDate(post.published_at ?? post.created_at, locale)}
            </time>
          </li>
        ))}
      </ol>
    </Layout>
  );
}

export function LinksPage({
  site,
  locale,
  colorMode,
  reader,
  admin,
  links,
}: BaseProps & { links: FriendLink[] }) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={t(locale, "links.title")}
      canonicalPath="/links"
      activeNav="links"
    >
      <header class="page-head">
        <h1 class="page-head__title">{t(locale, "links.title")}</h1>
        <p class="page-head__meta">{t(locale, "links.count", { n: links.length })}</p>
      </header>

      {links.length === 0 ? (
        <p class="muted">{t(locale, "links.empty")}</p>
      ) : (
        <div class="links-grid">
          {links.map((link) => (
            <a class="link-card" href={link.url} target="_blank" rel="noopener noreferrer">
              {link.avatar ? (
                <img class="link-card__avatar" src={link.avatar} alt="" loading="lazy" />
              ) : (
                <span class="link-card__avatar link-card__avatar--fallback">{link.name.slice(0, 1)}</span>
              )}
              <span class="link-card__body">
                <span class="link-card__name">{link.name}</span>
                {link.desc ? <span class="link-card__desc">{link.desc}</span> : null}
              </span>
            </a>
          ))}
        </div>
      )}
    </Layout>
  );
}

export function NotFoundPage({ site, locale, colorMode, reader, admin }: BaseProps) {
  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={t(locale, "notfound.title")}
      activeNav={undefined}
    >
      <div class="not-found">
        <h1 class="not-found__title">{t(locale, "notfound.title")}</h1>
        <p class="not-found__desc">{t(locale, "notfound.desc")}</p>
        <a class="btn btn--primary" href="/">
          {t(locale, "notfound.home")}
        </a>
      </div>
    </Layout>
  );
}
