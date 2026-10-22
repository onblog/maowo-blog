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
