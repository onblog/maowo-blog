import type { Child } from "hono/jsx";
import { t } from "../lib/i18n";
import { githubUrl } from "../lib/brand";
import type { AdminUser, Locale, ReaderUser, SiteRow, ColorMode } from "../types";

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
  admin: AdminUser | null;
  title?: string;
  description?: string;
  canonicalPath?: string;
  ogType?: "website" | "article";
  ogImage?: string | null;
  activeNav?: "home" | "series" | "archive" | "tags" | "about" | "post";
  children: Child;
};

const NAV: Array<{ key: "home" | "series" | "archive" | "tags" | "about"; href: string; label: Parameters<typeof t>[1] }> = [
  { key: "home", href: "/", label: "nav.home" },
  { key: "series", href: "/series", label: "nav.series" },
  { key: "archive", href: "/archive", label: "nav.archive" },
  { key: "tags", href: "/tags", label: "nav.tags" },
  { key: "about", href: "/about", label: "nav.about" },
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

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.88 1.5 2.3 1.07 2.86.82.09-.64.35-1.07.63-1.32-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

export function Layout(props: LayoutProps) {
  const { site, locale, colorMode, reader, admin, title, description, canonicalPath, ogType, ogImage } = props;
  const name = siteName(site);
  const fullTitle = title ? `${title} · ${name}` : name;
  const desc = description || siteTagline(site) || site.seo_description;

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
        <meta name="generator" content="miao-blog" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content={colorMode === "dark" ? "#17161a" : "#fdfbf3"} />
        <meta property="og:title" content={fullTitle} />
        {desc ? <meta property="og:description" content={desc} /> : null}
        <meta property="og:type" content={ogType ?? "website"} />
        <meta property="og:site_name" content={name} />
        {canonicalPath ? <meta property="og:url" content={canonicalPath} /> : null}
        {ogImage ? <meta property="og:image" content={ogImage} /> : null}
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
        <link rel="alternate" type="application/rss+xml" title={`${name} · RSS`} href="/feed.xml" />
        <link rel="stylesheet" href="/styles.css" />
        {/* 主题必须在样式表之前决定，否则暗色用户会先看到一帧白屏 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.documentElement.dataset.colorMode;var s=localStorage.getItem('miao:color');var t;if(s==='light'||s==='dark'){t=s;}else if(m==='dark'){t='dark';}else if(m==='light'){t='light';}else{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
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

        <footer class="site-footer">
          <div class="shell site-footer__inner">
            <p class="site-footer__copy">
              © {new Date().getUTCFullYear()} {site.owner_name || name} · {t(locale, "footer.reader_love")}
            </p>
            <p class="site-footer__meta">
              <a href="https://github.com/onblog/miao-blog" target="_blank" rel="noopener noreferrer">
                @MIAO-BLOG
              </a>
              {admin ? (
                <>
                  {" · "}
                  <a href="/admin">{t(locale, "nav.admin")}</a>
                </>
              ) : null}
            </p>
          </div>
        </footer>

        <script src="/app.js" defer />
      </body>
    </html>
  );
}

export { Mascot, GithubIcon, RssIcon, MoonIcon, SunIcon };
