import type { Locale } from "../types";

/**
 * 双语文案表。
 *
 * 设计约束：
 * 1. **key 扁平**，一个 key 一句话，视图里只出现 `t(locale, "nav.home")`，不出现任何字面文案。
 * 2. 插值用 `{name}` 占位，`t()` 负责替换；缺失的占位保持原样，方便发现漏参数。
 * 3. 中英文**同步增删**：新增 key 时两份都写，否则测试 `tests/i18n.test.ts` 会红。
 */
export const messages = {
  zh: {
    "nav.home": "首页",
    "nav.archive": "归档",
    "nav.tags": "标签",
    "nav.about": "关于",
    "nav.admin": "后台",
    "nav.rss": "订阅",

    "hero.greeting": "喵～ 欢迎来猫窝坐坐",
    "hero.subscribe": "订阅 RSS",
    "hero.write": "写点什么",

    "home.latest": "最新文章",
    "home.pinned": "置顶",
    "home.empty.title": "窝里还空着",
    "home.empty.desc": "去后台写下第一篇吧，喵在等你。",
    "home.stats.posts": "{n} 篇",
    "home.stats.words": "{n} 万字",
    "home.stats.tags": "{n} 个标签",

    "post.toc": "本文目录",
    "post.reading_time": "{n} 分钟阅读",
    "post.updated": "更新于 {date}",
    "post.published": "发布于 {date}",
    "post.tags": "标签",
    "post.prev": "上一篇",
    "post.next": "下一篇",
    "post.views": "{n} 次阅读",
    "post.author": "关于作者",

    "comments.title": "评论",
    "comments.count": "{n} 条评论",
    "comments.empty": "还没有评论，来抢个沙发～",
    "comments.login_hint": "用 GitHub 登录后就可以评论啦",
    "comments.login": "GitHub 登录",
    "comments.logout": "退出登录",
    "comments.you": "你",
    "comments.reply": "回复",
    "comments.reply_placeholder": "回复 @{name}……",
    "comments.placeholder": "说点什么吧……支持 Markdown",
    "comments.website": "你的博客地址（可选，方便我回访）",
    "comments.submit": "发表评论",
    "comments.submitting": "提交中……",
    "comments.disabled": "评论已关闭",
    "comments.owner": "博主",
    "comments.deleted": "该评论已删除",
    "comments.too_fast": "发得有点快，歇一会儿再来～",
    "comments.failed": "发表失败，请稍后再试",
    "comments.body_required": "评论不能为空",

    "theme.to_light": "切换到亮色",
    "theme.to_dark": "切换到暗色",
    "lang.switch": "English",
    "lang.current": "中文",

    "archive.title": "文章归档",
    "archive.count": "{n} 篇",
    "archive.empty": "还没有发布过文章",

    "tags.title": "全部标签",
    "tags.count": "{n} 篇",
    "tags.empty": "还没有标签",

    "about.title": "关于",
    "about.empty": "博主还没有写自我介绍",
    "about.links": "找到我",
    "about.contact": "联系我",

    "notfound.title": "这里没有猫",
    "notfound.desc": "页面走丢了，回首页看看吧。",
    "notfound.home": "回首页",

    "footer.powered": "由 miao-blog 驱动",
    "footer.reader_love": "为读者而做",

    "admin.login.title": "猫窝后台",
    "admin.login.hint": "账号密码来自部署时的环境变量",
    "admin.login.user": "账号",
    "admin.login.pass": "密码",
    "admin.login.submit": "登录",
    "admin.login.error": "账号或密码不对",
    "admin.logout": "退出",
    "admin.dashboard.title": "文章管理",
    "admin.dashboard.new": "写文章",
    "admin.edit": "编辑",
    "admin.delete": "删除",
    "admin.dashboard.empty": "还没有文章，点右上角写第一篇。",
    "admin.dashboard.published": "已发布",
    "admin.dashboard.draft": "草稿",
    "admin.dashboard.delete_confirm": "确定删除这篇文章吗？不可恢复。",
    "admin.editor.title": "标题",
    "admin.editor.slug": "地址（留空自动生成）",
    "admin.editor.content": "正文（Markdown）",
    "admin.editor.excerpt": "摘要（留空自动截取）",
    "admin.editor.cover": "封面图地址",
    "admin.editor.tags": "标签（用逗号分隔）",
    "admin.editor.lang": "语言",
    "admin.editor.pin": "置顶",
    "admin.editor.save_draft": "存草稿",
    "admin.editor.publish": "发布",
    "admin.editor.unpublish": "转为草稿",
    "admin.editor.preview": "预览",
    "admin.editor.saved": "已保存",
    "admin.editor.save_failed": "保存失败",
    "admin.editor.back": "返回列表",
    "admin.editor.view": "查看文章",
    "admin.comments.title": "评论管理",
    "admin.comments.post": "文章",
    "admin.comments.hide": "隐藏",
    "admin.comments.show": "显示",
    "admin.comments.delete": "删除",
    "admin.comments.empty": "还没有评论",
    "admin.settings.title": "站点设置",
    "admin.settings.saved": "设置已保存",
    "admin.import.title": "一键迁移",
    "admin.import.hint": "上传 Hexo / Hugo / Jekyll 导出的 Markdown 目录 zip，或粘贴多个 .md 内容。",
    "admin.import.choose": "选择 zip 文件",
    "admin.import.upload": "开始导入",
    "admin.import.result": "共 {total} 篇，导入 {imported} 篇，跳过 {skipped} 篇",
    "admin.tab.posts": "文章",
    "admin.tab.comments": "评论",
    "admin.tab.settings": "设置",
    "admin.tab.import": "迁移",
  },

  en: {
    "nav.home": "Home",
    "nav.archive": "Archive",
    "nav.tags": "Tags",
    "nav.about": "About",
    "nav.admin": "Admin",
    "nav.rss": "RSS",

    "hero.greeting": "Meow~ welcome to my little den",
    "hero.subscribe": "Subscribe",
    "hero.write": "Write",

    "home.latest": "Latest",
    "home.pinned": "Pinned",
    "home.empty.title": "The den is empty",
    "home.empty.desc": "Write your first post in the admin, the cat is waiting.",
    "home.stats.posts": "{n} posts",
    "home.stats.words": "{n}k words",
    "home.stats.tags": "{n} tags",

    "post.toc": "Contents",
    "post.reading_time": "{n} min read",
    "post.updated": "Updated {date}",
    "post.published": "Published {date}",
    "post.tags": "Tags",
    "post.prev": "Previous",
    "post.next": "Next",
    "post.views": "{n} views",
    "post.author": "About the author",

    "comments.title": "Comments",
    "comments.count": "{n} comments",
    "comments.empty": "No comments yet — be the first one.",
    "comments.login_hint": "Sign in with GitHub to leave a comment",
    "comments.login": "Sign in with GitHub",
    "comments.logout": "Sign out",
    "comments.you": "you",
    "comments.reply": "Reply",
    "comments.reply_placeholder": "Reply to @{name}…",
    "comments.placeholder": "Say something… Markdown supported",
    "comments.website": "Your blog URL (optional, so I can visit back)",
    "comments.submit": "Post comment",
    "comments.submitting": "Submitting…",
    "comments.disabled": "Comments are closed",
    "comments.owner": "Author",
    "comments.deleted": "This comment was deleted",
    "comments.too_fast": "Too fast — take a short break.",
    "comments.failed": "Failed to post, please retry",
    "comments.body_required": "Comment cannot be empty",

    "theme.to_light": "Switch to light",
    "theme.to_dark": "Switch to dark",
    "lang.switch": "中文",
    "lang.current": "English",

    "archive.title": "Archive",
    "archive.count": "{n} posts",
    "archive.empty": "Nothing published yet",

    "tags.title": "All tags",
    "tags.count": "{n} posts",
    "tags.empty": "No tags yet",

    "about.title": "About",
    "about.empty": "The author has not written a bio yet",
    "about.links": "Find me",
    "about.contact": "Contact",

    "notfound.title": "No cat here",
    "notfound.desc": "This page wandered off. Let's go home.",
    "notfound.home": "Back home",

    "footer.powered": "Powered by miao-blog",
    "footer.reader_love": "Made for readers",

    "admin.login.title": "Miao Blog Admin",
    "admin.login.hint": "Credentials come from deployment environment variables",
    "admin.login.user": "Username",
    "admin.login.pass": "Password",
    "admin.login.submit": "Sign in",
    "admin.login.error": "Wrong username or password",
    "admin.logout": "Sign out",
    "admin.dashboard.title": "Posts",
    "admin.dashboard.new": "New post",
    "admin.edit": "Edit",
    "admin.delete": "Delete",
    "admin.dashboard.empty": "No posts yet. Hit “New post” to start.",
    "admin.dashboard.published": "Published",
    "admin.dashboard.draft": "Draft",
    "admin.dashboard.delete_confirm": "Delete this post? This cannot be undone.",
    "admin.editor.title": "Title",
    "admin.editor.slug": "Slug (leave empty to auto-generate)",
    "admin.editor.content": "Content (Markdown)",
    "admin.editor.excerpt": "Excerpt (auto if empty)",
    "admin.editor.cover": "Cover image URL",
    "admin.editor.tags": "Tags (comma separated)",
    "admin.editor.lang": "Language",
    "admin.editor.pin": "Pin to top",
    "admin.editor.save_draft": "Save draft",
    "admin.editor.publish": "Publish",
    "admin.editor.unpublish": "Unpublish",
    "admin.editor.preview": "Preview",
    "admin.editor.saved": "Saved",
    "admin.editor.save_failed": "Save failed",
    "admin.editor.back": "Back to list",
    "admin.editor.view": "View post",
    "admin.comments.title": "Comments",
    "admin.comments.post": "Post",
    "admin.comments.hide": "Hide",
    "admin.comments.show": "Show",
    "admin.comments.delete": "Delete",
    "admin.comments.empty": "No comments yet",
    "admin.settings.title": "Site settings",
    "admin.settings.saved": "Settings saved",
    "admin.import.title": "Import",
    "admin.import.hint": "Upload a zip of Hexo / Hugo / Jekyll markdown, or paste .md contents.",
    "admin.import.choose": "Choose zip file",
    "admin.import.upload": "Start import",
    "admin.import.result": "{total} posts total, imported {imported}, skipped {skipped}",
    "admin.tab.posts": "Posts",
    "admin.tab.comments": "Comments",
    "admin.tab.settings": "Settings",
    "admin.tab.import": "Import",
  },
} as const;

export type MessageKey = keyof typeof messages.zh;

export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const dict = messages[locale] ?? messages.zh;
  const raw = (dict as Record<string, string>)[key] ?? (messages.zh as Record<string, string>)[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** 从 Accept-Language / URL 前缀推断语言：默认取站点默认语言 */
export function negotiateLocale(acceptLanguage: string | undefined, fallback: Locale): Locale {
  if (!acceptLanguage) return fallback;
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("zh")) return "zh";
  if (first.startsWith("en")) return "en";
  return fallback;
}
