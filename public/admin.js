/* 猫窝博客 —— 后台交互（无框架） */
(function () {
  "use strict";

  // ── 颜色模式：与前台同一套优先级，选择存在同一个 localStorage 键 ──
  var COLOR_KEY = "miao:color";

  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(COLOR_KEY, value);
    } catch (e) {}
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  });

  // ── 轻量 toast（与前台同一套视觉）──
  function showToast(message) {
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    window.requestAnimationFrame(function () {
      toast.classList.add("toast--show");
    });
    window.setTimeout(function () {
      toast.classList.remove("toast--show");
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // ── 代码块复制（编辑器预览区也会渲染同样的按钮）──
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
      showToast("复制成功");
      setTimeout(function () {
        btn.classList.remove("is-copied");
        btn.title = "复制代码";
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

  // ── 上传前压缩：Canvas -> WebP q=0.92，长边限 2560 ─────────────────
  // 纯前端完成，不占 Worker 的 CPU（免费版每请求只有 10ms）。
  // SVG 是矢量、GIF 是动图，Canvas 会毁掉它们的特性，因此原样上传。
  var COMPRESS_MIN_BYTES = 100 * 1024;
  var COMPRESS_MAX_SIDE = 2560;
  var COMPRESS_QUALITY = 0.92;

  function compressImage(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type)) return resolve(file);
      if (file.type === "image/svg+xml" || file.type === "image/gif") return resolve(file);
      if (file.size < COMPRESS_MIN_BYTES) return resolve(file);

      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var width = img.naturalWidth;
        var height = img.naturalHeight;
        if (!width || !height) return resolve(file);

        var scale = Math.min(1, COMPRESS_MAX_SIDE / Math.max(width, height));
        var targetW = Math.round(width * scale);
        var targetH = Math.round(height * scale);

        var canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        var ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob(
          function (blob) {
            // 压完反而更大就保留原图
            if (!blob || blob.size >= file.size) return resolve(file);
            var name = file.name.replace(/\.[^.]+$/, "") + ".webp";
            resolve(new File([blob], name, { type: "image/webp" }));
          },
          "image/webp",
          COMPRESS_QUALITY
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };
      img.src = objectUrl;
    });
  }

  function uploadMedia(file, onUploading, onDone) {
    compressImage(file).then(function (optimized) {
      var data = new FormData();
      data.append("file", optimized);
      return api("/api/admin/media", { method: "POST", body: data });
    }).then(onDone, function (err) {
      onDone({ ok: false, data: { error: (err && err.message) || "网络异常" } });
    });
  }

  // ── 文章列表筛选（纯前端：只隐藏行，不重新请求）────────────────────
  (function () {
    var filters = document.querySelector("[data-post-filters]");
    if (!filters) return;
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-post-row]"));
    if (rows.length === 0) return;

    var statusWrap = filters.querySelector("[data-filter-status]");
    var yearWrap = filters.querySelector("[data-filter-year]");
    var countEl = filters.querySelector("[data-filter-count]");
    var state = { status: "", year: "" };

    // 自定义下拉：按钮 + 浮层，不用原生 select（系统样式与站点不搭）
    function setupSelect(wrap, onPick) {
      if (!wrap) return null;
      var trigger = wrap.querySelector(".filter-select__trigger");
      var menu = wrap.querySelector(".filter-select__menu");
      var label = wrap.querySelector("[data-filter-label]");
      if (!trigger || !menu || !label) return null;

      function close() {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        wrap.classList.remove("filter-select--open");
      }
      function open() {
        // 同一时间只开一个
        document.querySelectorAll("[data-filter-select]").forEach(function (other) {
          if (other !== wrap) {
            var m = other.querySelector(".filter-select__menu");
            var t = other.querySelector(".filter-select__trigger");
            if (m) m.hidden = true;
            if (t) t.setAttribute("aria-expanded", "false");
            other.classList.remove("filter-select--open");
          }
        });
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        wrap.classList.add("filter-select--open");
      }

      trigger.addEventListener("click", function (event) {
        event.stopPropagation();
        menu.hidden ? open() : close();
      });

      menu.addEventListener("click", function (event) {
        var option = event.target.closest(".filter-select__option");
        if (!option) return;
        event.stopPropagation();
        var value = option.getAttribute("data-value") || "";
        label.textContent = option.textContent;
        Array.prototype.forEach.call(menu.querySelectorAll(".filter-select__option"), function (item) {
          item.classList.toggle("filter-select__option--active", item === option);
        });
        close();
        onPick(value);
      });

      document.addEventListener("click", close);
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") close();
      });

      return { menu: menu, label: label };
    }

    function apply() {
      var shown = 0;
      rows.forEach(function (row) {
        var match =
          (!state.status || row.getAttribute("data-status") === state.status) &&
          (!state.year || row.getAttribute("data-year") === state.year);
        row.hidden = !match;
        if (match) shown += 1;
      });
      if (countEl) {
        var template = countEl.getAttribute("data-template") || "{shown} / {total}";
        countEl.textContent = template.replace("{shown}", shown).replace("{total}", rows.length);
      }
    }

    setupSelect(statusWrap, function (value) {
      state.status = value;
      apply();
    });

    var yearSelect = setupSelect(yearWrap, function (value) {
      state.year = value;
      apply();
    });

    // 年份选项从列表里收集，降序 —— 不写死，哪年有文章就出哪年
    if (yearSelect) {
      var years = {};
      rows.forEach(function (row) {
        var year = row.getAttribute("data-year");
        if (year) years[year] = true;
      });
      Object.keys(years)
        .sort(function (a, b) {
          return Number(b) - Number(a);
        })
        .forEach(function (year) {
          var option = document.createElement("li");
          option.className = "filter-select__option";
          option.setAttribute("role", "option");
          option.setAttribute("data-value", year);
          option.textContent = year;
          yearSelect.menu.appendChild(option);
        });
    }

    apply();
  })();

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
          // 出厂默认口令：不进 next，直接去改密页（服务端守卫也会这么跳）。
          if (result.data && result.data.mustChange) {
            window.location.href = "/admin/account";
            return;
          }
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

  // ── 后台：账号与安全 ────────────────────────────────────────────────
  // 服务端已校验账号 / 密码规则；这里只补一个「两次输入是否一致」，
  // 免得把不一致的两次输入发上去、再让用户等一次往返。
  var accountForm = document.querySelector("[data-account-form]");
  if (accountForm) {
    accountForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var statusEl = document.querySelector("[data-account-status]");
      var read = function (name) {
        var el = accountForm.querySelector('input[name="' + name + '"]');
        return el ? el.value : "";
      };
      var setStatus = function (text, ok) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = "editor__status" + (ok ? " editor__status--ok" : " editor__status--error");
      };

      var password = read("password");
      if (password !== read("confirmPassword")) {
        setStatus("两次输入的新密码不一致", false);
        return;
      }

      setStatus("保存中…", true);
      api("/api/admin/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: read("currentPassword"),
          username: read("username").trim(),
          password: password
        })
      }).then(function (result) {
        if (!result.ok) {
          setStatus((result.data && result.data.message) || "保存失败", false);
          return;
        }
        // 服务端已换发新会话；回到被守卫拦下之前想去的页面。
        var params = new URLSearchParams(window.location.search);
        var next = params.get("next");
        window.location.href = next && next.indexOf("/admin") === 0 ? next : "/admin";
      });
    });
  }

  // ── Markdown 编辑器 ─────────────────────────────────────────────────
  var editorPage = document.querySelector("[data-editor-page]");
  if (editorPage) {
    var input = editorPage.querySelector("[data-editor-input]");
    var preview = editorPage.querySelector("[data-preview]");
    var split = editorPage.querySelector("[data-editor-split]");
    var modeBtn = editorPage.querySelector("[data-editor-mode-toggle]");
    var titleInput = editorPage.querySelector(".editor-title");
    var inlineFile = editorPage.querySelector("[data-inline-file]");
    var publishDialog = document.querySelector("[data-publish-dialog]");
    var publishForm = document.querySelector("[data-publish-form]");
    var saveStatus = document.querySelector("[data-save-status]");

    // ── 三态：边写边预览 → 只预览 → 只写 → 边写边预览；记忆在 localStorage ──
    var MODES = ["split", "preview", "write"];
    var mode = "split";
    try {
      var savedMode = localStorage.getItem("miao:editor-mode");
      if (MODES.indexOf(savedMode) >= 0) mode = savedMode;
    } catch (e) {}

    function applyMode(next) {
      mode = next;
      if (split) split.setAttribute("data-mode", mode);
      MODES.forEach(function (item) {
        var icon = modeBtn.querySelector('[data-mode-icon="' + item + '"]');
        if (icon) icon.hidden = item !== mode;
      });
      try {
        localStorage.setItem("miao:editor-mode", mode);
      } catch (e) {}
    }
    applyMode(mode);

    if (modeBtn) {
      modeBtn.addEventListener("click", function () {
        applyMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
      });
    }

    // ── 预览：交给服务端渲染，保证「预览 = 线上」 ──
    var previewTimer = null;
    function refreshPreview() {
      if (!input || !preview) return;
      api("/api/admin/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content_md: input.value })
      }).then(function (result) {
        if (result.ok && result.data && result.data.html) preview.innerHTML = result.data.html;
      });
    }
    if (input) {
      input.addEventListener("input", function () {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(refreshPreview, 350);
      });
      refreshPreview();
    }

    // ── 工具栏命令（都建立在三个适配函数上）──
    function replaceRange(start, end, text) {
      var value = input.value;
      input.value = value.slice(0, start) + text + value.slice(end);
      var caret = start + text.length;
      input.selectionStart = input.selectionEnd = caret;
    }

    function wrapSelection(before, after, placeholder) {
      var start = input.selectionStart;
      var end = input.selectionEnd;
      var selected = input.value.slice(start, end) || placeholder;
      replaceRange(start, end, before + selected + after);
      input.selectionStart = start + before.length;
      input.selectionEnd = start + before.length + selected.length;
    }

    function mapLines(fn) {
      var value = input.value;
      var start = input.selectionStart;
      var end = input.selectionEnd;
      var lineStart = value.lastIndexOf("\n", start - 1) + 1;
      var lineEnd = value.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = value.length;
      var lines = value.slice(lineStart, lineEnd).split("\n");
      var mapped = lines.map(function (line, index) {
        return fn(line, index);
      });
      replaceRange(lineStart, lineEnd, mapped.join("\n"));
    }

    var COMMANDS = {
      bold: function () {
        wrapSelection("**", "**", "粗体");
      },
      italic: function () {
        wrapSelection("*", "*", "斜体");
      },
      code: function () {
        wrapSelection("`", "`", "代码");
      },
      h2: function () {
        mapLines(function (line) {
          return "## " + line.replace(/^#{1,6}\s+/, "");
        });
      },
      h3: function () {
        mapLines(function (line) {
          return "### " + line.replace(/^#{1,6}\s+/, "");
        });
      },
      ul: function () {
        mapLines(function (line) {
          return "- " + line.replace(/^[-*+]\s+/, "");
        });
      },
      ol: function () {
        mapLines(function (line, index) {
          return index + 1 + ". " + line.replace(/^\d+\.\s+/, "");
        });
      },
      quote: function () {
        mapLines(function (line) {
          return "> " + line.replace(/^>\s?/, "");
        });
      },
      link: function () {
        wrapSelection("[", "](https://)", "链接文字");
      }
    };

    editorPage.querySelectorAll("[data-cmd]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var command = COMMANDS[btn.getAttribute("data-cmd")];
        if (!command || !input) return;
        command();
        input.focus();
        refreshPreview();
      });
    });

    // ── 工具栏插图：上传 R2 后把 Markdown 图片语法写进光标处 ──
    var uploadBtn = editorPage.querySelector("[data-upload-inline]");
    if (uploadBtn && inlineFile) {
      uploadBtn.addEventListener("click", function () {
        inlineFile.click();
      });
      inlineFile.addEventListener("change", function () {
        var file = inlineFile.files && inlineFile.files[0];
        if (!file) return;
        var original = uploadBtn.textContent;
        uploadBtn.disabled = true;
        uploadBtn.textContent = "…";
        // 同样先压缩再上传（WebP 0.92），与图片字段走同一条链路
        uploadMedia(file, null, function (res) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = original;
          if (res.ok && res.data && res.data.url && input) {
            var alt = file.name.replace(/\.[^.]+$/, "");
            var at = input.selectionStart;
            var snippet = "\n![" + alt + "](" + res.data.url + ")\n";
            replaceRange(at, input.selectionEnd, snippet);
            input.focus();
            refreshPreview();
          } else {
            window.alert("上传失败：" + ((res.data && res.data.error) || "未知错误"));
          }
          inlineFile.value = "";
        });
      });
    }

    // ── 发布时间：库里存 UTC 毫秒，输入框按本地时区显示 ──
    function localizePublishTime() {
      var field = document.querySelector("[data-published-at]");
      if (!field) return;
      var utc = field.getAttribute("data-published-utc");
      if (!utc) return;
      var d = new Date(Number(utc));
      if (isNaN(d.getTime())) return;
      var pad = function (n) {
        return String(n).padStart(2, "0");
      };
      field.value =
        d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
        "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }
    localizePublishTime();

    // ── 发布弹窗 ──
    var openBtn = document.querySelector("[data-open-publish]");
    if (openBtn && publishDialog) {
      openBtn.addEventListener("click", function () {
        localizePublishTime();
        publishDialog.showModal();
      });
    }
    var cancelBtn = document.querySelector("[data-publish-cancel]");
    if (cancelBtn && publishDialog) {
      cancelBtn.addEventListener("click", function () {
        publishDialog.close();
      });
    }

    function collectPayload() {
      var form = publishForm;
      var val = function (name) {
        var el = form.querySelector('[name="' + name + '"]');
        return el ? el.value : "";
      };
      var checked = function (name) {
        var el = form.querySelector('[name="' + name + '"]');
        return !!(el && el.checked);
      };
      var published = form.querySelector('[name="published_at"]');
      return {
        title: titleInput ? titleInput.value.trim() : "",
        content_md: input ? input.value : "",
        tags: val("tags"),
        excerpt: val("excerpt"),
        cover_image: val("cover_image"),
        series: val("series"),
        pinned: checked("pinned"),
        status: checked("draft") ? "draft" : "published",
        published_at: published && published.value ? new Date(published.value).getTime() : null
      };
    }

    /**
     * 保存成功后的确认框：只有一个「确定」，点它才刷新。
     * 之前是保存后 500ms 直接跳转，作者来不及确认「到底存成草稿还是发出去了」。
     */
    function showSaveSuccess(post, isDraft) {
      var dialog = document.createElement("dialog");
      dialog.className = "publish-dialog";
      dialog.innerHTML =
        '<div class="publish-dialog__form">' +
        '<h2 class="publish-dialog__title">' + (isDraft ? "已保存为草稿" : "发布成功") + "</h2>" +
        '<p class="publish-success__hint">' +
        (isDraft ? "草稿不会出现在前台，随时可以回来继续写。" : "文章已经上线，读者现在可以看到了。") +
        "</p>" +
        '<div class="publish-dialog__actions">' +
        '<button class="btn btn--primary" type="button" data-success-confirm>确定</button>' +
        "</div></div>";
      document.body.appendChild(dialog);

      // 只留一个出口：屏蔽 Esc，避免"关掉弹窗但没刷新"的中间态
      dialog.addEventListener("cancel", function (event) {
        event.preventDefault();
      });
      dialog.showModal();

      dialog.querySelector("[data-success-confirm]").addEventListener("click", function () {
        window.location.reload();
      });
    }

    function savePost() {
      if (!publishForm) return;
      var payload = collectPayload();
      if (!payload.title) {
        if (saveStatus) {
          saveStatus.textContent = "标题不能为空";
          saveStatus.className = "editor__status editor__status--error";
        }
        return;
      }
      var id = editorPage.getAttribute("data-post-id");
      if (saveStatus) {
        saveStatus.textContent = "保存中……";
        saveStatus.className = "editor__status";
      }
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
          if (saveStatus) {
            saveStatus.textContent =
              result.data && result.data.error === "title_required" ? "标题不能为空" : "保存失败";
            saveStatus.className = "editor__status editor__status--error";
          }
          return;
        }
        var post = result.data.post;
        editorPage.setAttribute("data-post-id", post.id);
        if (saveStatus) {
          saveStatus.textContent = "已保存";
          saveStatus.className = "editor__status editor__status--ok";
        }
        if (!id) {
          history.replaceState(null, "", "/admin/edit/" + post.id);
        }
        if (publishDialog) publishDialog.close();
        showSaveSuccess(result.data.post, payload.status === "draft");
      });
    }

    if (publishForm) {
      publishForm.addEventListener("submit", function (event) {
        event.preventDefault();
        savePost();
      });
    }

    // ⌘S / Ctrl+S 也走发布弹窗，避免两种保存路径给出不同结果
    document.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (publishDialog) {
          localizePublishTime();
          publishDialog.showModal();
        }
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

  // 手动粘贴地址时也要让删除按钮跟着出现/收起，不能只靠上传流程切换。
  document.querySelectorAll("[data-image-url]").forEach(function (urlInput) {
    urlInput.addEventListener("input", function () {
      var field = urlInput.closest(".image-field");
      if (!field) return;
      field.setAttribute("data-has-image", urlInput.value.trim() ? "1" : "0");
      // 地址变了但预览图还是旧的 → 直接按新地址重画，避免「地址和图对不上」
      var preview = field.querySelector("[data-image-preview]");
      if (!preview) return;
      var value = urlInput.value.trim();
      var img = preview.querySelector("img");
      if (!value) {
        if (img) img.remove();
        return;
      }
      if (img) {
        img.src = value;
      } else {
        img = document.createElement("img");
        img.src = value;
        img.alt = "";
        preview.appendChild(img);
      }
    });
  });

  // 移除已上传的图片：清空地址栏，缩略图与按钮一起收起。
  // 只从表单撤下，不删 R2 上的对象 —— 同一张图可能还被别的文章引用。
  document.querySelectorAll("[data-remove-image]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var field = btn.closest(".image-field");
      if (!field) return;
      var urlInput = field.querySelector("[data-image-url]");
      var preview = field.querySelector("[data-image-preview]");
      if (urlInput) urlInput.value = "";
      if (preview) {
        var img = preview.querySelector("img");
        if (img) img.remove();
      }
      field.setAttribute("data-has-image", "0");
      if (urlInput) urlInput.focus();
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
        btn.textContent = "处理中…";
      }
      uploadMedia(file, null, function (res) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original;
        }
        if (res.ok && res.data && res.data.url) {
          if (urlInput) urlInput.value = res.data.url;
          if (preview) {
            // 只换 <img>，不清空容器：容器里还有右上角的删除按钮
            var oldImg = preview.querySelector("img");
            if (oldImg) oldImg.remove();
            var img = document.createElement("img");
            img.src = res.data.url;
            img.alt = "";
            preview.appendChild(img);
          }
          if (field) field.setAttribute("data-has-image", "1");
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

    // 新结构是 name；label_zh/label_en 只用于兼容更早的数据
    function linkLabel(link) {
      return link.name || link.label_zh || link.label_en || "link";
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

        // 头像：优先用存下来的地址，否则实时抓对方 favicon，失败回退首字母
        var avatar = document.createElement("span");
        avatar.className = "link-row__avatar";
        var avatarImg = document.createElement("img");
        avatarImg.alt = "";
        avatarImg.loading = "lazy";
        avatarImg.src = link.avatar || "/api/favicon?url=" + encodeURIComponent(link.url);
        avatarImg.addEventListener("error", function () {
          if (avatarImg.parentNode) avatarImg.parentNode.removeChild(avatarImg);
          avatar.classList.add("link-row__avatar--fallback");
          avatar.textContent = (link.name || "?").slice(0, 1);
        });
        avatar.appendChild(avatarImg);

        var body = document.createElement("span");
        body.className = "link-row__body";

        var a = document.createElement("a");
        a.className = "link-row__name";
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.title = link.url;
        a.textContent = linkLabel(link);
        body.appendChild(a);

        if (link.desc) {
          var descEl = document.createElement("span");
          descEl.className = "link-row__desc";
          descEl.textContent = link.desc;
          body.appendChild(descEl);
        }

        var del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn--danger btn--sm";
        del.textContent = "删除";
        del.addEventListener("click", function () {
          links.splice(index, 1);
          renderLinks();
        });

        li.appendChild(handle);
        li.appendChild(avatar);
        li.appendChild(body);
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
        var val = function (name) {
          var el = linkForm.querySelector('input[name="' + name + '"]');
          return el ? el.value.trim() : "";
        };
        var name = val("link_name");
        var url = val("link_url");
        if (!name || !url) return;
        // 图标不再上传，前台按 URL 实时抓 favicon
        links.push({ name: name, url: url, desc: val("link_desc"), avatar: "" });
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

  // ── 后台：信鸽通知 ───────────────────────────────────────────────────
  // 与站点设置分开保存：Token 是敏感值，不该跟着每次「保存设置」多走一趟。
  // 「关闭通知」用两次点击确认，不用 window.confirm —— 后台的交互一律走自己的样式。
  var notifySection = document.querySelector("[data-notify]");
  if (notifySection) {
    var notifyEndpoint = notifySection.querySelector("[data-notify-endpoint]");
    var notifyToken = notifySection.querySelector("[data-notify-token]");
    var notifyState = notifySection.querySelector("[data-notify-state]");
    var notifyStatus = notifySection.querySelector("[data-notify-status]");
    var notifySave = notifySection.querySelector("[data-notify-save]");
    var notifyTest = notifySection.querySelector("[data-notify-test]");
    var notifyClear = notifySection.querySelector("[data-notify-clear]");

    var setNotifyStatus = function (text, ok) {
      if (!notifyStatus) return;
      notifyStatus.textContent = text || "";
      notifyStatus.className =
        "editor__status" + (text ? (ok ? " editor__status--ok" : " editor__status--error") : "");
    };

    var setNotifyEnabled = function (enabled) {
      if (notifyState) notifyState.textContent = enabled ? "已开启" : "未开启";
    };

    // 保存成功后：Token 输入框清空，placeholder 换成服务端回的打码预览。
    var applyNotifyView = function (view) {
      if (!view) return;
      if (notifyEndpoint) notifyEndpoint.value = view.endpoint || "";
      if (notifyToken) {
        notifyToken.value = "";
        notifyToken.placeholder = view.tokenSet
          ? view.tokenPreview + " · 留空表示不修改"
          : "pg_…";
      }
      setNotifyEnabled(Boolean(view.tokenSet && view.endpoint));
    };

    var notifyErrorText = function (data) {
      var error = data && data.error;
      if (error === "invalid_endpoint") return "接口地址格式不正确，请填写域名（例如 https://你的域名）";
      if (error === "endpoint_https_required") return "接口地址必须是 https";
      if (error === "token_invalid") return "Token 无效，不能包含空白字符";
      if (error === "token_too_long") return "Token 过长";
      if (error === "notify_unconfigured") return "请先填写接口地址与 Token";
      if (error === "notify_failed") {
        if (data.reason === "timeout") return "发送超时，请检查接口地址";
        if (data.reason === "network") return "网络错误，请稍后再试";
        if (data.reason === "http") return "信鸽返回 HTTP " + data.status;
      }
      return "操作失败，请稍后再试";
    };

    if (notifySave) {
      notifySave.addEventListener("click", function () {
        var payload = { endpoint: notifyEndpoint ? notifyEndpoint.value : "" };
        // 留空 = 不修改 Token；只有真的输入了新值才发，避免把打码预览当 Token 存回去。
        var token = notifyToken ? notifyToken.value.trim() : "";
        if (token) payload.token = token;

        if (notifySave.disabled) return;
        notifySave.disabled = true;
        setNotifyStatus("保存中……", true);
        api("/api/admin/notify", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              applyNotifyView(result.data);
              setNotifyStatus("通知设置已保存", true);
              showToast("通知设置已保存");
            } else {
              setNotifyStatus(notifyErrorText(result.data), false);
            }
          })
          .catch(function () {
            setNotifyStatus("网络异常，请稍后再试", false);
          })
          .then(function () {
            notifySave.disabled = false;
          });
      });
    }

    if (notifyTest) {
      notifyTest.addEventListener("click", function () {
        if (notifyTest.disabled) return;
        notifyTest.disabled = true;
        setNotifyStatus("发送中……", true);
        api("/api/admin/notify/test", { method: "POST" })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              setNotifyStatus("测试通知已发出，请查看信鸽", true);
            } else {
              setNotifyStatus(notifyErrorText(result.data), false);
            }
          })
          .catch(function () {
            setNotifyStatus("网络异常，请稍后再试", false);
          })
          .then(function () {
            notifyTest.disabled = false;
          });
      });
    }

    if (notifyClear) {
      var clearLabel = notifyClear.textContent;
      var clearTimer = null;
      var restoreClear = function () {
        notifyClear.textContent = clearLabel;
        clearTimer = null;
      };
      notifyClear.addEventListener("click", function () {
        if (clearTimer) {
          window.clearTimeout(clearTimer);
          restoreClear();
          notifyClear.disabled = true;
          setNotifyStatus("正在关闭……", true);
          api("/api/admin/notify", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: "", token: "" })
          })
            .then(function (result) {
              if (result.ok && result.data && result.data.ok) {
                applyNotifyView(result.data);
                setNotifyStatus("通知已关闭", true);
                showToast("通知已关闭");
              } else {
                setNotifyStatus(notifyErrorText(result.data), false);
              }
            })
            .catch(function () {
              setNotifyStatus("网络异常，请稍后再试", false);
            })
            .then(function () {
              notifyClear.disabled = false;
            });
          return;
        }
        // 第一次点击只负责「确认」，不碰数据；4 秒内不确认就复原。
        notifyClear.textContent = "再点一次确认关闭";
        setNotifyStatus("关闭后会清空接口地址与 Token", false);
        clearTimer = window.setTimeout(restoreClear, 4000);
      });
    }
  }

  // ── 后台：评论敏感词 ─────────────────────────────────────────────────
  // 只做三件事：上传（整份覆盖）、下载（纯链接，无需脚本）、清空。
  // **不展示词表内容** —— 它不是给人读的；要改就下载、改完再上传。
  // 入口在 /admin/comments 右上角，点开是原生 <dialog>：Esc / 点遮罩 / 关闭按钮都能收起。
  var sensitiveSection = document.querySelector("[data-sensitive-words]");
  if (sensitiveSection) {
    var sensitiveDialog = document.querySelector("[data-sensitive-dialog]");
    var sensitiveOpen = document.querySelector("[data-sensitive-open]");
    var sensitiveFile = sensitiveSection.querySelector("[data-sensitive-file]");
    var sensitiveUpload = sensitiveSection.querySelector("[data-sensitive-upload]");
    var sensitiveClear = sensitiveSection.querySelector("[data-sensitive-clear]");
    var sensitiveStatus = sensitiveSection.querySelector("[data-sensitive-status]");
    var sensitiveSummary = sensitiveSection.querySelector("[data-sensitive-summary]");

    var setSensitiveStatus = function (text, ok) {
      if (!sensitiveStatus) return;
      sensitiveStatus.textContent = text || "";
      sensitiveStatus.className =
        "editor__status" + (text ? (ok ? " editor__status--ok" : " editor__status--error") : "");
    };

    if (sensitiveDialog && typeof sensitiveDialog.showModal === "function") {
      if (sensitiveOpen) {
        sensitiveOpen.addEventListener("click", function () {
          // 每次打开都清掉上一次的残留状态，否则半小时前的"上传成功"还挂在弹窗里
          setSensitiveStatus("", true);
          sensitiveDialog.showModal();
        });
      }
      sensitiveDialog.querySelectorAll("[data-sensitive-close]").forEach(function (button) {
        button.addEventListener("click", function () {
          sensitiveDialog.close();
        });
      });
      // 点遮罩关闭：dialog 自身铺满视口，点到的 target 是它本体而不是内容区
      sensitiveDialog.addEventListener("click", function (event) {
        if (event.target === sensitiveDialog) sensitiveDialog.close();
      });
    }

    // 摘要由服务端渲染好（含分类分布），前端只负责替换，不自己拼文案
    var applySensitiveSummary = function (data) {
      if (!sensitiveSummary || !data || typeof data.summary !== "string") return;
      sensitiveSummary.textContent = data.summary;
    };

    var uploadSensitive = function (file) {
      if (!file) return;
      if (!/\.txt$/i.test(file.name)) {
        setSensitiveStatus("只支持 .txt 文件", false);
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        setSensitiveStatus("读取文件失败，请确认是 UTF-8 文本", false);
      };
      reader.onload = function () {
        if (sensitiveUpload) sensitiveUpload.disabled = true;
        setSensitiveStatus("上传中……", true);
        api("/api/admin/sensitive-words", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: String(reader.result || "") })
        })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              applySensitiveSummary(result.data);
              var extra =
                result.data.truncated > 0 ? "；超出上限 " + result.data.truncated + " 个词未保存" : "";
              setSensitiveStatus("已覆盖词表：" + result.data.total + " 个词" + extra, true);
            } else {
              setSensitiveStatus("上传失败，请稍后再试", false);
            }
          })
          .catch(function () {
            setSensitiveStatus("网络异常，请稍后再试", false);
          })
          .then(function () {
            if (sensitiveUpload) sensitiveUpload.disabled = false;
            if (sensitiveFile) sensitiveFile.value = "";
          });
      };
      reader.readAsText(file, "utf-8");
    };

    if (sensitiveUpload && sensitiveFile) {
      sensitiveUpload.addEventListener("click", function () {
        sensitiveFile.click();
      });
      sensitiveFile.addEventListener("change", function () {
        uploadSensitive(sensitiveFile.files && sensitiveFile.files[0]);
      });
    }

    if (sensitiveClear) {
      sensitiveClear.addEventListener("click", function () {
        if (!window.confirm("清空后评论将不再被敏感词拦截，确定清空？")) return;
        api("/api/admin/sensitive-words", { method: "DELETE" })
          .then(function (result) {
            if (result.ok) {
              applySensitiveSummary(result.data);
              setSensitiveStatus("词表已清空", true);
            } else {
              setSensitiveStatus("清空失败，请稍后再试", false);
            }
          })
          .catch(function () {
            setSensitiveStatus("网络异常，请稍后再试", false);
          });
      });
    }
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
