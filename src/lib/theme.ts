/**
 * 首屏主题引导脚本。
 *
 * 优先级（前后台必须完全一致，否则作者在前台选的主题到后台会「失效」）：
 *   1. 读者/作者的手动选择（localStorage['miao:color']）
 *   2. 站点默认（`data-color-mode`：light / dark / auto）
 *   3. 系统偏好（prefers-color-scheme）
 *
 * 必须内联在 <head> 里、样式表之前执行，否则暗色用户会先看到一帧白屏。
 * 只有这一处定义：layout.tsx 与 admin.tsx 都引用它，避免两份逻辑漂移。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.documentElement.dataset.colorMode;var s=localStorage.getItem('miao:color');var t;if(s==='light'||s==='dark'){t=s;}else if(m==='dark'){t='dark';}else if(m==='light'){t='light';}else{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;
