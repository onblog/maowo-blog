import type { Locale, PostSummary } from "../types";
import { formatDate } from "./format";
import { t } from "../lib/i18n";

/** 文章卡片：首页与标签页共用 */
export function PostCard({ post, locale, compact = false }: { post: PostSummary; locale: Locale; compact?: boolean }) {
  const date = formatDate(post.published_at ?? post.created_at, locale);
  return (
    <article class={`post-card${compact ? " post-card--compact" : ""}`}>
      <h2 class="post-card__title">
        <a href={`/p/${post.slug}`}>{post.title}</a>
      </h2>
      {post.excerpt ? <p class="post-card__excerpt">{post.excerpt}</p> : null}
      <div class="post-card__meta">
        <time datetime={new Date(post.published_at ?? post.created_at).toISOString()}>{date}</time>
        <span class="dot" aria-hidden="true">·</span>
        <span>{t(locale, "post.reading_time", { n: post.reading_minutes })}</span>
        {post.tags.length > 0 ? (
          <span class="post-card__tags">
            {post.tags.map((tag) => (
              <a class="tag-chip" href={`/tags/${tag.slug}`}>
                #{tag.name}
              </a>
            ))}
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** 分页：可分享、可回退、允许爬虫顺着走 */
export function Pagination({
  page,
  totalPages,
  basePath,
  locale,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  locale: Locale;
}) {
  if (totalPages <= 1) return null;
  const href = (n: number) => (n === 1 ? basePath : `${basePath}?page=${n}`);
  const pages: number[] = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
  }

  return (
    <nav class="pagination" aria-label="Pagination">
      {page > 1 ? (
        <a class="pagination__btn" href={href(page - 1)} rel="prev">
          ← {locale === "zh" ? "上一页" : "Prev"}
        </a>
      ) : (
        <span class="pagination__btn pagination__btn--disabled">←</span>
      )}
      <span class="pagination__pages">
        {pages.map((n, index) => (
          <>
            {index > 0 && n - (pages[index - 1] ?? n) > 1 ? <span class="pagination__gap">…</span> : null}
            {n === page ? (
              <span class="pagination__page pagination__page--current">{n}</span>
            ) : (
              <a class="pagination__page" href={href(n)}>
                {n}
              </a>
            )}
          </>
        ))}
      </span>
      {page < totalPages ? (
        <a class="pagination__btn" href={href(page + 1)} rel="next">
          {locale === "zh" ? "下一页" : "Next"} →
        </a>
      ) : (
        <span class="pagination__btn pagination__btn--disabled">→</span>
      )}
    </nav>
  );
}
