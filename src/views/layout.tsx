import type { Child } from "hono/jsx";
import { t } from "../lib/i18n";
import { ASSET_VERSION, githubUrl } from "../lib/brand";
import { THEME_BOOT_SCRIPT } from "../lib/theme";
import type { Locale, ReaderUser, SiteRow, ColorMode } from "../types";

export function siteName(site: SiteRow): string {
  return site.name;
}

export function siteTagline(site: SiteRow): string {
  return site.tagline;
}

export function ownerBio(site: SiteRow): string {
  return site.owner_bio;
}

export type LayoutProps = {
  site: SiteRow;
  locale: Locale;
  colorMode: ColorMode;
  reader: ReaderUser | null;
  title?: string;
  description?: string;
  canonicalPath?: string;
  ogType?: "website" | "article";
  ogImage?: string | null;
  /** 搜索结果页这类「有内容但不该被索引」的页面用 */
  noindex?: boolean;
  activeNav?: "home" | "series" | "archive" | "tags" | "about" | "links" | "post";
  children: Child;
};

const NAV: Array<{ key: "home" | "series" | "archive" | "tags" | "about" | "links"; href: string; label: Parameters<typeof t>[1] }> = [
  { key: "home", href: "/", label: "nav.home" },
  { key: "series", href: "/series", label: "nav.series" },
  { key: "archive", href: "/archive", label: "nav.archive" },
  { key: "tags", href: "/tags", label: "nav.tags" },
  { key: "about", href: "/about", label: "nav.about" },
  { key: "links", href: "/links", label: "nav.links" },
];

/** 猫 mascot（内联 SVG，零请求、可随主题变色） */
function Mascot({ size = 30 }: { size?: number }) {
  return (
    <svg class="mascot" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M12 26 10 8l16 9a30 30 0 0 1 12 0l16-9-2 18c3 4 5 9 5 14 0 12-11 20-25 20S7 52 7 40c0-5 2-10 5-14Z"
        fill="var(--mascot-fill)"
        stroke="var(--mascot-stroke)"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <circle cx="24" cy="36" r="3.4" fill="var(--mascot-stroke)" />
      <circle cx="40" cy="36" r="3.4" fill="var(--mascot-stroke)" />
      <path d="M28 45c1.6 1.6 2.7 2.2 4 2.2s2.4-.6 4-2.2" stroke="var(--mascot-stroke)" stroke-width="2.6" stroke-linecap="round" />
      <path d="M6 40H1M63 40h-5" stroke="var(--mascot-stroke)" stroke-width="2.2" stroke-linecap="round" opacity=".55" />
    </svg>
  );
}





function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function RssIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" fill="currentColor" />
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" stroke-width="2" />
      <path d="m16 16 4.4 4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.88 1.5 2.3 1.07 2.86.82.09-.64.35-1.07.63-1.32-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}


/**
 * 拉绳小猫：滚动到一屏之后从顶部垂下来，点击平滑回到顶部。
 * 只在首页与文章页渲染（两个阅读场景），窄屏由 CSS 隐藏。
 */
function CatRope({ locale }: { locale: Locale }) {
  return (
    <div class="cat-rope" data-cat-rope aria-hidden="false">
      <span class="cat-rope__line" aria-hidden="true" />
      <button
        class="cat-rope__cat"
        type="button"
        data-cat-rope-btn
        aria-label={locale === "zh" ? "回到顶部" : "Back to top"}
        title={locale === "zh" ? "拉我上去" : "Pull me up"}
      >
        <svg class="cat-rope__svg" viewBox="0 0 56 64" aria-hidden="true">
          <path
            d="M14 17 10 3l13 8"
            fill="var(--mascot-fill)"
            stroke="var(--mascot-stroke)"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
          <path
            d="M42 17 46 3l-13 8"
            fill="var(--mascot-fill)"
            stroke="var(--mascot-stroke)"
            stroke-width="2.4"
            stroke-linejoin="round"
          />
          <path
            d="M9 27c0-8.4 8.5-14.5 19-14.5S47 18.6 47 27s-8.5 14-19 14S9 35.4 9 27Z"
            fill="var(--mascot-fill)"
            stroke="var(--mascot-stroke)"
            stroke-width="2.4"
          />
          <path
            d="M19 27c1.8-2.2 4-2.2 5.8 0M31.2 27c1.8-2.2 4-2.2 5.8 0"
            fill="none"
            stroke="var(--mascot-stroke)"
            stroke-width="2"
            stroke-linecap="round"
          />
          <rect
            x="16.5"
            y="39"
            width="23"
            height="8"
            rx="4"
            fill="var(--accent)"
            stroke="var(--mascot-stroke)"
            stroke-width="2"
          />
          <path
            d="M28 47c0 6.5 4.5 8.5 8 6.5"
            fill="none"
            stroke="var(--mascot-stroke)"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

/**
 * 站内搜索浮层。
 *
 * 用原生 `<dialog>` 只是为了拿 top-layer、焦点陷阱和 Esc —— 外观、输入框、按钮、
 * 空状态全部自绘，不出现任何浏览器默认控件。
 * 顶栏入口是一个指向 `/search` 的链接：脚本没跑（或被禁用）时直接去兜底页，
 * 不会留下一个「点了没反应」的死按钮。
 */
function SearchDialog({ locale }: { locale: Locale }) {
  return (
    <dialog
      class="search"
      id="site-search"
      data-search-dialog
      aria-labelledby="site-search-title"
      data-i18n-count={t(locale, "search.count")}
      data-i18n-empty={t(locale, "search.empty")}
      data-i18n-loading={t(locale, "search.loading")}
      data-i18n-error={t(locale, "search.error")}
      data-i18n-hint={t(locale, "search.hint")}
      data-i18n-all={t(locale, "search.all")}
      data-i18n-reading={t(locale, "post.reading_time")}
    >
      <div class="search__panel">
        <h2 class="sr-only" id="site-search-title">
          {t(locale, "search.title")}
        </h2>

        <form class="search__form" action="/search" method="get" role="search" data-search-form>
          <span class="search__glyph" aria-hidden="true">
            <SearchIcon size={19} />
          </span>
          <input
            class="search__input"
            type="text"
            name="q"
            maxlength={64}
            placeholder={t(locale, "search.placeholder")}
            aria-label={t(locale, "search.title")}
            autocomplete="off"
            spellcheck={false}
            autocapitalize="off"
            inputmode="search"
            enterkeyhint="search"
            data-search-input
          />
          <button
            class="search__clear"
            type="button"
            data-search-clear
            aria-label={t(locale, "search.clear")}
            title={t(locale, "search.clear")}
            hidden
          >
            <CloseIcon size={14} />
          </button>
          <button
            class="search__cancel"
            type="button"
            data-search-close
            title={t(locale, "search.close")}
          >
            {t(locale, "search.cancel")}
          </button>
          <button class="sr-only" type="submit">
            {t(locale, "search.submit")}
          </button>
        </form>

        <div class="search__meta">
          <span class="search__status" role="status" aria-live="polite" data-search-status />
          <a class="search__seeall" data-search-seeall href="/search" hidden></a>
        </div>

        <div class="search__body" data-search-body>
          <div class="search__placeholder" data-search-placeholder>
            <span class="search__placeholder-icon" aria-hidden="true">
              <SearchIcon size={30} />
            </span>
            <p class="search__placeholder-text" data-search-placeholder-text>
              {t(locale, "search.hint")}
            </p>
          </div>
          <ul class="search__results" data-search-results role="list" hidden></ul>
        </div>

        <div class="search__foot">
          <span class="search__kbd">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            {t(locale, "search.kbd_move")}
          </span>
          <span class="search__kbd">
            <kbd>Enter</kbd>
            {t(locale, "search.kbd_open")}
          </span>
          <span class="search__kbd">
            <kbd>Esc</kbd>
            {t(locale, "search.kbd_close")}
          </span>
        </div>
      </div>
    </dialog>
  );
}

export function Layout(props: LayoutProps) {
  const { site, locale, colorMode, reader, title, description, canonicalPath, ogType, ogImage } = props;
  const name = siteName(site);
  const fullTitle = title ? `${title} · ${name}` : name;
  const desc = description || siteTagline(site) || site.seo_description;
  // 绝对地址：OG 与 canonical 都要求完整 URL，相对路径社交抓取器解析不了。
  let canonicalUrl: string | null = null;
  if (canonicalPath) {
    try {
      canonicalUrl = new URL(canonicalPath, `${site.url || "http://localhost"}/`).toString();
    } catch {
      canonicalUrl = null;
    }
  }

  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme={colorMode === "auto" ? undefined : colorMode}
      data-color-mode={colorMode}
    >
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        {desc ? <meta name="description" content={desc} /> : null}
        {props.noindex ? <meta name="robots" content="noindex, follow" /> : null}
        <meta name="generator" content="maowo-blog" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content={colorMode === "dark" ? "#17161a" : "#fdfbf3"} />
        <meta property="og:title" content={fullTitle} />
        {desc ? <meta property="og:description" content={desc} /> : null}
        <meta property="og:type" content={ogType ?? "website"} />
        <meta property="og:site_name" content={name} />
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
        {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : null}
        {ogImage ? <meta property="og:image" content={ogImage} /> : null}
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="alternate" type="application/rss+xml" title={`${name} · RSS`} href="/feed.xml" />
        <link rel="stylesheet" href={`/styles.css?v=${ASSET_VERSION}`} />
        {/* 主题必须在样式表之前决定，否则暗色用户会先看到一帧白屏 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a class="skip-link" href="#main">
          {locale === "zh" ? "跳到正文" : "Skip to content"}
        </a>
        <header class="site-header">
          <div class="shell site-header__inner">
            <a class="brand" href="/" aria-label={name}>
              <Mascot />
              <span class="brand__name">{name}</span>
            </a>
            <nav class="nav" aria-label="Main">
              {NAV.map((item) => (
                <a
                  class={`nav__link${props.activeNav === item.key ? " nav__link--active" : ""}`}
                  href={item.href}
                >
                  {t(locale, item.label)}
                </a>
              ))}
            </nav>
            <div class="header-actions">
              {/* 搜索入口放在主题图标左边：先找内容，再调外观 */}
              <a
                class="icon-btn"
                href="/search"
                data-search-open
                title={t(locale, "search.open")}
                aria-label={t(locale, "search.open")}
                aria-haspopup="dialog"
                aria-controls="site-search"
              >
                <SearchIcon />
              </a>
              {/* 读者行为：手动切换亮/暗，覆盖方式写在 localStorage，优先级高于站点默认 */}
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
              {site.owner_github ? (
                <a
                  class="icon-btn"
                  href={githubUrl(site.owner_github) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="GitHub"
                  aria-label="GitHub"
                >
                  <GithubIcon />
                </a>
              ) : null}
              <a class="icon-btn" href="/feed.xml" title={t(locale, "nav.rss")} aria-label={t(locale, "nav.rss")}>
                <RssIcon />
              </a>
            </div>
          </div>
        </header>

        <main id="main" class="shell main">
          {props.children}
        </main>

        {(props.activeNav === "home" || props.activeNav === "post") && <CatRope locale={locale} />}

        <footer class="site-footer">
          <div class="shell site-footer__inner">
            <p class="site-footer__copy">
              © {new Date().getUTCFullYear()} {site.owner_name || name} · {t(locale, "footer.reader_love")}
            </p>
            <p class="site-footer__meta">
              {/*
                GitHub 入口：用官方图标代替原来的 `@` 前缀。
                图标与文字同色（currentColor），hover 时一起变色；
                可访问名仍是链接里的 MAOWO-BLOG，图标对读屏隐藏。
              */}
              <a
                class="site-footer__repo"
                href="https://github.com/onblog/maowo-blog"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon size={14} />
                <span>MAOWO-BLOG</span>
              </a>
            </p>
          </div>
        </footer>

        <SearchDialog locale={locale} />

        <script src={`/app.js?v=${ASSET_VERSION}`} defer />
      </body>
    </html>
  );
}

export { Mascot, GithubIcon, RssIcon, SearchIcon, MoonIcon, SunIcon };
