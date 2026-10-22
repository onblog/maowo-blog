/* 只在含 mermaid 图表的页面被动态加载；打包后挂在 window.__mermaid 上 */
import mermaid from "mermaid";
window.__mermaid = mermaid;
