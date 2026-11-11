import type { ColorMode, Locale, ReaderUser, SiteRow } from "../types";
import type { SearchResult } from "../services/search";
import { t } from "../lib/i18n";
import { Layout, SearchIcon } from "./layout";
import { formatDate, isoDate } from "./format";

type BaseProps = {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  reader: ReaderUser | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把命中的关键词包进 `<mark>`；文本一律作为 JSX 子节点，不拼 HTML */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const valid = terms.filter(Boolean).sort((a, b) => b.length - a.length);
  if (valid.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${valid.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <mark class="search-mark">{part}</mark> : part,
      )}
    </>
  );
}

/**
 * 搜索页：浮层的可分享 / 无 JS 兜底。
 *
 * 有 JS 时顶栏图标会给浮层；直接打开 `/search?q=` 也能拿到同样的结果，
 * 链接可以发给人，搜索引擎侧用 noindex 挡掉。
 */
export function SearchPage({ site, locale, colorMode, reader, result }: BaseProps & { result: SearchResult }) {
  const { query, terms, total, hits } = result;
  const hasQuery = query.length > 0;

  return (
    <Layout
      site={site}
      locale={locale}
      colorMode={colorMode}
      reader={reader}
      title={t(locale, "search.title")}
      description={t(locale, "search.page_desc")}
      noindex
    >
      <header class="page-head page-head--search">
        <h1 class="page-head__title">{t(locale, "search.title")}</h1>
        {hasQuery ? <p class="page-head__meta">{t(locale, "search.count", { n: total })}</p> : null}
      </header>

      <form class="search-page__form" action="/search" method="get" role="search">
        <span class="search-page__glyph" aria-hidden="true">
          <SearchIcon size={20} />
        </span>
        <input
          class="search-page__input"
          type="text"
          name="q"
          value={query}
          maxlength={64}
          placeholder={t(locale, "search.placeholder")}
          aria-label={t(locale, "search.title")}
          autocomplete="off"
          spellcheck={false}
          autocapitalize="off"
          inputmode="search"
          enterkeyhint="search"
          autofocus
        />
        <button class="btn btn--primary search-page__submit" type="submit">
          {t(locale, "search.submit")}
        </button>
      </form>

      {!hasQuery ? (
        <div class="search-page__hint">
          <p class="search-page__hint-text">{t(locale, "search.hint")}</p>
          <a class="btn" href="/tags">
            {t(locale, "search.browse_tags")}
          </a>
        </div>
      ) : hits.length === 0 ? (
        <div class="search-page__hint">
          <p class="search-page__hint-title">{t(locale, "search.empty", { q: query })}</p>
          <p class="search-page__hint-text">{t(locale, "search.hint")}</p>
        </div>
      ) : (
        <>
          <ol class="search-page__list">
            {hits.map((hit) => (
              <li>
                <article class="search-result">
                  <h2 class="search-result__title">
                    <a href={`/p/${hit.slug}`}>
                      <Highlight text={hit.title} terms={terms} />
                    </a>
                  </h2>
                  {hit.snippet ? (
                    <p class="search-result__snippet">
                      <Highlight text={hit.snippet} terms={terms} />
                    </p>
                  ) : null}
                  <div class="search-result__meta">
                    <time datetime={isoDate(hit.publishedAt)}>{formatDate(hit.publishedAt, locale)}</time>
                    <span class="dot" aria-hidden="true">·</span>
                    <span>{t(locale, "post.reading_time", { n: hit.readingMinutes })}</span>
                  </div>
                </article>
              </li>
            ))}
          </ol>
          {total > hits.length ? (
            <p class="search-page__truncated">{t(locale, "search.truncated", { n: hits.length })}</p>
          ) : null}
        </>
      )}
    </Layout>
  );
}
