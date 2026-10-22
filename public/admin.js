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
    var seriesInput = postForm.querySelector('input[name="series"]');
    var publishedInput = postForm.querySelector("[data-published-at]");

    // 发布时间：库里存 UTC 毫秒，输入框要按**读者本地时区**显示
    if (publishedInput) {
      var utc = publishedInput.getAttribute("data-published-utc");
      if (utc) {
        var d = new Date(Number(utc));
        if (!isNaN(d.getTime())) {
          var pad = function (n) { return String(n).padStart(2, "0"); };
          publishedInput.value =
            d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
            "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
        }
      }
    }
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
        series: seriesInput ? seriesInput.value.trim() : "",
        // 空 = 由服务端按「发布时用当前时间 / 草稿保持空」处理
        published_at: publishedInput && publishedInput.value ? new Date(publishedInput.value).getTime() : null,
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

  // ── 图片上传（封面 / 头像）：POST /api/admin/media → 回填 URL ──────
  document.querySelectorAll("[data-upload-image]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var field = btn.closest(".image-field");
      var fileInput = field && field.querySelector("[data-image-file]");
      if (fileInput) fileInput.click();
    });
  });

  document.querySelectorAll("[data-image-file]").forEach(function (fileInput) {
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var field = fileInput.closest(".image-field");
      var urlInput = field.querySelector("[data-image-url]");
      var preview = field.querySelector("[data-image-preview]");
      var btn = field.querySelector("[data-upload-image]");
      var original = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "上传中…";
      }
      var data = new FormData();
      data.append("file", file);
      api("/api/admin/media", { method: "POST", body: data }).then(function (res) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original;
        }
        if (res.ok && res.data && res.data.url) {
          if (urlInput) urlInput.value = res.data.url;
          if (preview) {
            preview.innerHTML = "";
            var img = document.createElement("img");
            img.src = res.data.url;
            img.alt = "";
            preview.appendChild(img);
          }
        } else {
          window.alert("上传失败：" + ((res.data && res.data.error) || "未知错误"));
        }
        fileInput.value = "";
      });
    });
  });

  // ── 友情链接：列表 + 弹窗新增，底层仍然存 JSON ────────────────────
  var linksEditor = document.querySelector("[data-links-editor]");
  if (linksEditor) {
    var linksInput = linksEditor.querySelector('input[name="owner_links"]');
    var linksList = linksEditor.querySelector("[data-links-list]");
    var linkDialog = document.querySelector("[data-link-dialog]");
    var linkForm = linkDialog ? linkDialog.querySelector("[data-link-form]") : null;
    var links = [];
    try {
      links = JSON.parse((linksInput && linksInput.value) || "[]");
      if (!Array.isArray(links)) links = [];
    } catch (e) {
      links = [];
    }

    function linkLabel(link) {
      return link.label_zh || link.label_en || "link";
    }

    var dragIndex = -1;

    function renderLinks() {
      if (!linksList) return;
      linksList.innerHTML = "";
      links.forEach(function (link, index) {
        var li = document.createElement("li");
        li.className = "link-row";
        // 拖动排序：拖起来 -> 经过目标高亮 -> 松手时才重排（拖拽中重建 DOM 会中断拖拽）
        li.draggable = true;
        li.addEventListener("dragstart", function (event) {
          dragIndex = index;
          li.classList.add("link-row--dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(index));
          }
        });
        li.addEventListener("dragend", function () {
          li.classList.remove("link-row--dragging");
          dragIndex = -1;
        });
        li.addEventListener("dragover", function (event) {
          event.preventDefault();
          if (dragIndex !== -1 && dragIndex !== index) li.classList.add("link-row--drop-target");
        });
        li.addEventListener("dragleave", function () {
          li.classList.remove("link-row--drop-target");
        });
        li.addEventListener("drop", function (event) {
          event.preventDefault();
          li.classList.remove("link-row--drop-target");
          if (dragIndex === -1 || dragIndex === index) return;
          var moved = links.splice(dragIndex, 1)[0];
          links.splice(index, 0, moved);
          dragIndex = -1;
          renderLinks();
        });

        // 拖拽手柄：没有它用户不会知道这一行能拖
        var handle = document.createElement("span");
        handle.className = "link-row__handle";
        handle.setAttribute("aria-hidden", "true");
        handle.textContent = "⠿";

        var a = document.createElement("a");
        a.className = "link-row__name";
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = linkLabel(link);

        var url = document.createElement("span");
        url.className = "link-row__url";
        url.textContent = link.url;

        var del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn--danger btn--sm";
        del.textContent = "删除";
        del.addEventListener("click", function () {
          links.splice(index, 1);
          renderLinks();
        });

        li.appendChild(handle);
        li.appendChild(a);
        li.appendChild(url);
        li.appendChild(del);
        linksList.appendChild(li);
      });
      // 每次变更都同步回隐藏 input，保存时随表单一起提交
      if (linksInput) linksInput.value = JSON.stringify(links);
    }
    renderLinks();

    var addLinkBtn = linksEditor.querySelector("[data-add-link]");
    if (addLinkBtn && linkDialog && linkForm) {
      addLinkBtn.addEventListener("click", function () {
        linkForm.reset();
        linkDialog.showModal();
      });
    }

    if (linkDialog) {
      var cancelBtn = linkDialog.querySelector("[data-link-cancel]");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function () {
          linkDialog.close();
        });
      }
    }

    if (linkForm && linkDialog) {
      linkForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var nameInput = linkForm.querySelector('input[name="link_name"]');
        var urlInput = linkForm.querySelector('input[name="link_url"]');
        var name = nameInput ? nameInput.value.trim() : "";
        var url = urlInput ? urlInput.value.trim() : "";
        if (!name || !url) return;
        // 单语言站点：名称只存一份（旧数据的 label_en 仍可读，保持兼容）
        links.push({ label_zh: name, label_en: name, url: url });
        renderLinks();
        linkDialog.close();
      });
    }
  }

  // ── 后台：站点设置 ───────────────────────────────────────────────────
  var settingsForm = document.querySelector("[data-settings-form]");
  if (settingsForm) {
    settingsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var statusEl = document.querySelector("[data-settings-status]");
      var payload = {};
      settingsForm.querySelectorAll("input, textarea, select").forEach(function (input) {
        if (!input.name) return;
        // 弹窗里的字段属于链接编辑器，不进站点设置
        if (input.closest("[data-link-dialog]")) return;
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
