/* 猫窝博客 —— 前台交互（无框架，~2KB） */
(function () {
  "use strict";

  // ── 颜色模式（读者行为）──────────────────────────────────────────────
  // 优先级：读者的手动选择（localStorage）> 站点默认（data-color-mode）> 系统偏好。
  // 手动选择后就用它，不再跟站点或系统变化；清掉 localStorage 即回到默认。
  var STORAGE_KEY = "miao:color";

  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* 隐私模式下写不进去，不影响本次会话 */
    }
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  });

  // ── 代码块复制（事件委托：编辑器预览里动态插入的代码块也覆盖）──
  document.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-copy-code]");
    if (!btn) return;
    var block = btn.closest(".code-block");
    var code = block ? block.querySelector("code") : null;
    if (!code) return;
    var text = code.textContent || "";

    function markDone() {
      btn.classList.add("is-copied");
      btn.title = "已复制";
      btn.setAttribute("aria-label", "已复制");
      setTimeout(function () {
        btn.classList.remove("is-copied");
        btn.title = "复制代码";
        btn.setAttribute("aria-label", "复制代码");
      }, 1500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(markDone, function () {
        window.prompt("复制下面的代码：", text);
      });
    } else {
      window.prompt("复制下面的代码：", text);
    }
  });

  // ── 拉绳小猫：滚过一屏才出现，点击回到顶部 ───────────────────────────
  var catRope = document.querySelector("[data-cat-rope]");
  if (catRope) {
    var catBtn = catRope.querySelector("[data-cat-rope-btn]");
    var SHOW_AT = 400; // 约一屏的四分之一，太早出现会挡视线
    var ticking = false;

    function syncCat() {
      var doc = document.documentElement;
      // 内容不足一屏时没有"回到顶部"的意义，直接不出现
      var scrollable = doc.scrollHeight > window.innerHeight + 200;
      var show = scrollable && window.scrollY > SHOW_AT;
      catRope.classList.toggle("cat-rope--visible", show);
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(syncCat);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncCat);
    syncCat();

    if (catBtn) {
      catBtn.addEventListener("click", function () {
        // 先收起来再滚：视觉上是"猫被拉上去"，滚到底后 syncCat 也不会再显示它
        catRope.classList.remove("cat-rope--visible");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  // ── Mermaid 图表：懒加载 + 源码/预览切换 ─────────────────────────────
  var diagrams = document.querySelectorAll("[data-mermaid]");
  if (diagrams.length) {
    var mermaidPromise = null;
    var lastTheme = document.documentElement.dataset.theme;

    function loadMermaid() {
      if (window.__mermaid) return Promise.resolve(window.__mermaid);
      if (mermaidPromise) return mermaidPromise;
      mermaidPromise = new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = "/vendor/mermaid.min.js";
        script.async = true;
        script.onload = function () {
          if (window.__mermaid) resolve(window.__mermaid);
          else reject(new Error("mermaid 未挂载"));
        };
        script.onerror = function () {
          reject(new Error("mermaid 加载失败"));
        };
        document.head.appendChild(script);
      });
      return mermaidPromise;
    }

    // 配色全部取自站点 CSS 变量，亮暗主题各有一套
    function themeVariables() {
      var cs = getComputedStyle(document.documentElement);
      var dark = document.documentElement.dataset.theme === "dark";
      var v = function (name) {
        return cs.getPropertyValue(name).trim();
      };
      return {
        darkMode: dark,
        background: v("--surface") || (dark ? "#1e1d22" : "#ffffff"),
        primaryColor: v("--accent-soft"),
        mainBkg: v("--accent-soft"),
        primaryTextColor: v("--ink"),
        primaryBorderColor: v("--accent"),
        nodeBorder: v("--accent"),
        lineColor: v("--ink-soft"),
        secondaryColor: v("--surface-soft"),
        tertiaryColor: v("--canvas"),
        clusterBkg: v("--surface-soft"),
        clusterBorder: v("--hairline-strong"),
        titleColor: v("--ink"),
        edgeLabelBackground: v("--surface"),
        fontFamily: v("--font-sans")
      };
    }

    function iconSvg(kind) {
      if (kind === "code") {
        return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3 2 8l4 5M10 3l4 5-4 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      return '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.6 8S3.9 3.8 8 3.8 14.4 8 14.4 8 12.1 12.2 8 12.2 1.6 8 1.6 8Z" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.7" stroke="currentColor" stroke-width="1.6"/></svg>';
    }

    function renderAll() {
      loadMermaid()
        .then(function (mermaid) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: themeVariables(),
            flowchart: { curve: "basis", useMaxWidth: true },
            sequence: { useMaxWidth: true },
            gantt: { useMaxWidth: true }
          });

          diagrams.forEach(function (fig, index) {
            var pre = fig.querySelector("pre.mermaid");
            if (!pre) return;
            var source = fig.getAttribute("data-source");
            if (!source) {
              source = pre.textContent || "";
              fig.setAttribute("data-source", source);
            }
            var id = "miao-mermaid-" + index + "-" + Date.now().toString(36);
            mermaid
              .render(id, source)
              .then(function (result) {
                fig.setAttribute("data-svg", result.svg);
                if (!fig.classList.contains("diagram--source")) pre.innerHTML = result.svg;
                fig.classList.add("diagram--ready");
                fig.classList.remove("diagram--error");
              })
              .catch(function (err) {
                fig.classList.add("diagram--error");
                fig.classList.remove("diagram--ready");
                fig.setAttribute("data-error", String((err && err.message) || err).slice(0, 160));
              });
          });
        })
        .catch(function () {
          // 库加载失败：保留源码，至少不白屏
          diagrams.forEach(function (fig) {
            fig.classList.add("diagram--static");
          });
        });
    }

    diagrams.forEach(function (fig) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "diagram__toggle";
      button.title = "查看源码";
      button.setAttribute("aria-label", "切换源码与预览");
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = iconSvg("code");
      fig.appendChild(button);

      button.addEventListener("click", function () {
        var pre = fig.querySelector("pre.mermaid");
        var source = fig.getAttribute("data-source") || "";
        var svg = fig.getAttribute("data-svg") || "";
        var showSource = fig.classList.toggle("diagram--source");
        if (pre) {
          if (showSource) pre.textContent = source;
          else if (svg) pre.innerHTML = svg;
        }
        button.innerHTML = iconSvg(showSource ? "preview" : "code");
        button.title = showSource ? "查看预览" : "查看源码";
        button.setAttribute("aria-pressed", showSource ? "true" : "false");
      });
    });

    renderAll();

    // 读者切换亮暗后重渲染，图表配色跟着走
    new MutationObserver(function () {
      var theme = document.documentElement.dataset.theme;
      if (theme === lastTheme) return;
      lastTheme = theme;
      renderAll();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  // ── 友链图标：favicon 抓不到就回退成首字母 ──────────────────────────
  (function () {
    function swapToFallback(img) {
      var span = document.createElement("span");
      span.className = img.className + " link-card__avatar--fallback";
      span.textContent = img.getAttribute("data-fallback") || "?";
      if (img.parentNode) img.parentNode.replaceChild(span, img);
    }
    document.querySelectorAll("[data-favicon]").forEach(function (img) {
      // 图片可能在脚本执行前就已经失败了
      if (img.complete && img.naturalWidth === 0) {
        swapToFallback(img);
        return;
      }
      img.addEventListener("error", function () {
        swapToFallback(img);
      });
    });
  })();

  // ── 评论 ─────────────────────────────────────────────────────────────
  var form = document.querySelector("[data-comment-form]");
  var section = document.querySelector("[data-post-slug]");
  var statusEl = document.querySelector("[data-comment-status]");

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.className = "comment-form__status" + (kind ? " comment-form__status--" + kind : "");
  }

  if (form && section) {
    var postSlug = section.getAttribute("data-post-slug");
    var parentInput = form.querySelector('input[name="parentId"]');
    var bodyInput = form.querySelector('textarea[name="body"]');
    var websiteInput = form.querySelector('input[name="website"]');

    // 回复：点「回复」= 填 parentId + 改 placeholder，不弹窗
    document.querySelectorAll("[data-reply-to]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!parentInput || !bodyInput) return;
        parentInput.value = btn.getAttribute("data-reply-to") || "";
        var name = btn.getAttribute("data-reply-name") || "";
        bodyInput.placeholder = "回复 @" + name + "……";
        bodyInput.focus();
        bodyInput.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var body = (bodyInput && bodyInput.value.trim()) || "";
      if (!body) {
        setStatus("评论不能为空", "error");
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "提交中……";
      }
      setStatus("");

      fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId: null,
          postSlug: postSlug,
          parentId: parentInput ? parentInput.value || null : null,
          body: body,
          website: websiteInput ? websiteInput.value : ""
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            window.location.reload();
            return;
          }
          var message =
            result.data && result.data.error === "too_fast"
              ? "发得有点快，歇一会儿再来～"
              : result.data && result.data.error === "unauthorized"
                ? "登录已过期，请重新登录"
                : "发表失败，请稍后再试";
          setStatus(message, "error");
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "发表评论";
          }
        })
        .catch(function () {
          setStatus("网络异常，请稍后再试", "error");
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "发表评论";
          }
        });
    });
  }

  // ── 退出登录 ──────────────────────────────────────────────────────────
  var logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      fetch("/api/auth/logout", { method: "POST" }).then(function () {
        window.location.reload();
      });
    });
  }

  // ── 作者身份：隐藏/删除评论（页面上直接操作，省一次进后台）──────────────
  document.querySelectorAll("[data-hide-comment]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-hide-comment");
      var visible = btn.getAttribute("data-status") === "visible";
      fetch("/api/admin/comments/" + encodeURIComponent(id) + "/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: visible ? "hidden" : "visible" })
      }).then(function () {
        window.location.reload();
      });
    });
  });

  document.querySelectorAll("[data-delete-comment]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!window.confirm("确定删除这条评论吗？")) return;
      var id = btn.getAttribute("data-delete-comment");
      fetch("/api/admin/comments/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
        window.location.reload();
      });
    });
  });
})();
