import type { AdminUser, Locale, PostSummary, ReaderUser, SiteRow, ColorMode } from "../types";
import type { ListResult } from "../services/posts";
import { t } from "../lib/i18n";
import { Layout, Mascot, siteName, siteTagline } from "./layout";
import { PostCard, Pagination } from "./post-card";

export type HomeProps = {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  reader: ReaderUser | null;
  admin: AdminUser | null;
  list: ListResult;
  stats: { posts: number; words: number; tags: number };
};

export function HomePage({ site, locale, colorMode, reader, admin, list, stats }: HomeProps) {
  const name = siteName(site);
  const tagline = siteTagline(site);
  const description = tagline || (site.seo_description);

  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      admin={admin}
      title={undefined}
      description={description}
      canonicalPath="/"
      activeNav="home"
    >
      <section class="hero">
        <div class="hero__copy">
          <p class="hero__greeting">{t(locale, "hero.greeting")}</p>
          <h1 class="hero__title">{name}</h1>
          {tagline ? <p class="hero__tagline">{tagline}</p> : null}
          <div class="hero__actions">
            <a class="btn btn--primary" href="/feed.xml">
              {t(locale, "hero.subscribe")}
            </a>
            <a class="btn" href="/about">
              {t(locale, "nav.about")}
            </a>
          </div>
          <dl class="hero__stats">
            <div class="hero__stat">
              <dt>{t(locale, "home.stat.posts")}</dt>
              <dd>{stats.posts}</dd>
            </div>
            <div class="hero__stat">
              <dt>{t(locale, "home.stat.words")}</dt>
              <dd>{stats.words}</dd>
            </div>
            <div class="hero__stat">
              <dt>{t(locale, "home.stat.tags")}</dt>
              <dd>{stats.tags}</dd>
            </div>
          </dl>
        </div>
        <div class="hero__art" aria-hidden="true">
          <Mascot size={168} />
        </div>
      </section>

      <section class="feed">
        <div class="section-head">
          <h2 class="section-head__title">{t(locale, "home.latest")}</h2>
          <span class="section-head__count">{list.total}</span>
        </div>

        {list.items.length === 0 ? (
          <div class="empty-state">
            <Mascot size={96} />
            <h3 class="empty-state__title">{t(locale, "home.empty.title")}</h3>
            <p class="empty-state__desc">{t(locale, "home.empty.desc")}</p>
            {admin ? (
              <a class="btn btn--primary" href="/admin/new">
                {t(locale, "admin.dashboard.new")}
              </a>
            ) : null}
          </div>
        ) : (
          <div class="post-list">
            {list.items.map((post: PostSummary) => (
              <PostCard post={post} locale={locale} />
            ))}
          </div>
        )}

        <Pagination page={list.page} totalPages={list.totalPages} basePath="/" locale={locale} />
      </section>
    </Layout>
  );
}
