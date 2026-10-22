/* 猫窝博客 —— 后台交互（无框架） */
(function () {
  "use strict";

  var STORAGE_KEY = "miao:color";

  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {}
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  });

  function api(path, options) {
    return fetch(path, options).then(function (res) {
      return res.json().then(
        function (data) {
          return { ok: res.ok, status: res.status, data: data };
        },
        function () {
          return { ok: res.ok, status: res.status, data: null };
        }
      );
    });
  }

  // ── 登录 ─────────────────────────────────────────────────────────────
  var loginForm = document.querySelector("[data-login-form]");
  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var errorEl = loginForm.querySelector("[data-form-error]");
      var username = loginForm.querySelector('input[name="username"]').value;
      var password = loginForm.querySelector('input[name="password"]').value;
      if (errorEl) errorEl.textContent = "";

      api("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username, password: password })
      }).then(function (result) {
        if (result.ok) {
          var params = new URLSearchParams(window.location.search);
          window.location.href = params.get("next") || "/admin";
          return;
        }
        if (errorEl) {
          errorEl.textContent =
            result.status === 429 ? "尝试次数过多，请 15 分钟后再试" : "账号或密码不对";
        }
      });
    });
  }

  // ── 退出 ─────────────────────────────────────────────────────────────
  var logoutBtn = document.querySelector("[data-admin-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      api("/api/admin/logout", { method: "POST" }).then(function () {
        window.location.href = "/admin/login";
      });
    });
  }

  // ── 编辑器：保存 / 发布 / 预览 ───────────────────────────────────────
  var postForm = document.querySelector("[data-post-form]");
  if (postForm) {
    var statusEl = document.querySelector("[data-save-status]");
    var previewEl = document.querySelector("[data-preview]");
    var contentInput = postForm.querySelector('textarea[name="content_md"]');
    var titleInput = postForm.querySelector('input[name="title"]');
    var slugInput = postForm.querySelector('input[name="slug"]');

    function setStatus(text, kind) {
      if (!statusEl) return;
      var labels = { ok: "已保存", error: "保存失败" };
      statusEl.textContent = text || labels[kind] || "";
      statusEl.className = "editor__status" + (kind ? " editor__status--" + kind : "");
    }

    // 预览：交给服务端渲染，保证「预览 = 线上」（同一份 markdown-it + 高亮）
    var previewTimer = null;
    function refreshPreview() {
      if (!previewEl || !contentInput) return;
      api("/api/admin/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content_md: contentInput.value })
      }).then(function (result) {
        if (result.ok && result.data && result.data.html) previewEl.innerHTML = result.data.html;
      });
    }
    if (contentInput) {
      contentInput.addEventListener("input", function () {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(refreshPreview, 350);
      });
      refreshPreview();
    }

    function collect(status) {
      return {
        title: titleInput ? titleInput.value.trim() : "",
        slug: slugInput ? slugInput.value.trim() : "",
        content_md: contentInput ? contentInput.value : "",
        excerpt: (postForm.querySelector('textarea[name="excerpt"]') || {}).value || "",
        cover_image: (postForm.querySelector('input[name="cover_image"]') || {}).value || "",
        lang: (postForm.querySelector('select[name="lang"]') || {}).value || "zh",
        tags: (postForm.querySelector('input[name="tags"]') || {}).value || "",
        pinned: !!((postForm.querySelector('input[name="pinned"]') || {}).checked),
        status: status
      };
    }

    function save(status) {
      var id = postForm.getAttribute("data-post-id");
      var payload = collect(status);
      if (!payload.title) {
        setStatus("标题不能为空", "error");
        return;
      }
      setStatus("保存中……");
      var request = id
        ? api("/api/admin/posts/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          })
        : api("/api/admin/posts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });

      request.then(function (result) {
        if (!result.ok) {
          setStatus(result.data && result.data.error === "title_required" ? "标题不能为空" : "保存失败", "error");
          return;
        }
        var post = result.data.post;
        postForm.setAttribute("data-post-id", post.id);
        if (slugInput) slugInput.value = post.slug;
        setStatus("已保存", "ok");
        // 新建成功后换成编辑态，避免重复创建
        if (!id) {
          history.replaceState(null, "", "/admin/edit/" + post.id);
        }
      });
    }

    postForm.querySelectorAll("[data-save-post]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        save(btn.getAttribute("data-save-post") || "draft");
      });
    });

    // ⌘S / Ctrl+S 存草稿
    document.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        save("draft");
      }
    });
  }

  // ── 后台：删除文章 ───────────────────────────────────────────────────
  document.querySelectorAll("[data-delete-post]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var message = btn.getAttribute("data-confirm") || "确定删除？";
      if (!window.confirm(message)) return;
      var id = btn.getAttribute("data-delete-post");
      api("/api/admin/posts/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
        window.location.reload();
      });
    });
  });

  // ── 后台：评论状态 / 删除 ────────────────────────────────────────────
  document.querySelectorAll("[data-toggle-comment]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-toggle-comment");
      var next = btn.getAttribute("data-next");
      api("/api/admin/comments/" + encodeURIComponent(id) + "/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next })
      }).then(function () {
        window.location.reload();
      });
    });
  });

  document.querySelectorAll("[data-remove-comment]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!window.confirm("确定删除这条评论吗？")) return;
      var id = btn.getAttribute("data-remove-comment");
      api("/api/admin/comments/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
        window.location.reload();
      });
    });
  });

  // ── 后台：站点设置 ───────────────────────────────────────────────────
  var settingsForm = document.querySelector("[data-settings-form]");
  if (settingsForm) {
    settingsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var statusEl = document.querySelector("[data-settings-status]");
      var payload = {};
      settingsForm.querySelectorAll("input, textarea, select").forEach(function (input) {
        if (!input.name) return;
        if (input.type === "checkbox") payload[input.name] = input.checked;
        else payload[input.name] = input.value;
      });

      api("/api/admin/site", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (result) {
        if (statusEl) {
          statusEl.textContent = result.ok ? "设置已保存" : "保存失败";
          statusEl.className = "editor__status" + (result.ok ? " editor__status--ok" : " editor__status--error");
        }
      });
    });
  }

  // ── 后台：复制 Agent 提示词 ──────────────────────────────────────────
  var copyBtn = document.querySelector("[data-copy-prompt]");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var target = document.querySelector("[data-prompt-content]");
      if (!target) return;
      var text = target.textContent || "";
      var done = function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = "已复制";
        setTimeout(function () {
          copyBtn.textContent = original;
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          window.prompt("复制下面的内容：", text);
        });
      } else {
        window.prompt("复制下面的内容：", text);
      }
    });
  }
})();
