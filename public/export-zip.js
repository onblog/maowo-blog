/* 猫窝博客 —— 导出为 zip（Jekyll 结构：md + 同名目录图片 + 相对路径） */
(function () {
  "use strict";

  // ── CRC32（zip 必需）──
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    var time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
    var day =
      (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { time: time, day: day };
  }

  /**
   * 生成 zip（全部 store，不压缩）。
   * 图片本身已是 WebP/PNG 压缩态，md 又很小，二次压缩收益低而 CPU 成本高；
   * store 模式让打包在浏览器里几秒完成。
   */
  function buildZip(entries) {
    var chunks = [];
    var central = [];
    var offset = 0;
    var encoder = new TextEncoder();

    entries.forEach(function (entry) {
      var nameBytes = encoder.encode(entry.name);
      var data = entry.data;
      var crc = crc32(data);
      var size = data.length;
      var dt = dosDateTime(entry.date || new Date());

      var header = new Uint8Array(30 + nameBytes.length);
      var hv = new DataView(header.buffer);
      hv.setUint32(0, 0x04034b50, true);
      hv.setUint16(4, 20, true);
      hv.setUint16(6, 0x0800, true); // UTF-8 文件名
      hv.setUint16(8, 0, true); // store
      hv.setUint16(10, dt.time, true);
      hv.setUint16(12, dt.day, true);
      hv.setUint32(14, crc, true);
      hv.setUint32(18, size, true);
      hv.setUint32(22, size, true);
      hv.setUint16(26, nameBytes.length, true);
      hv.setUint16(28, 0, true);
      header.set(nameBytes, 30);
      chunks.push(header, data);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dt.time, true);
      cv.setUint16(14, dt.day, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += header.length + size;
    });

    var centralSize = central.reduce(function (sum, item) {
      return sum + item.length;
    }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [eocd]), { type: "application/zip" });
  }

  // ── 命名与内容 ──
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function slugifyTitle(title) {
    return String(title || "")
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "untitled";
  }

  function folderName(post) {
    var d = new Date(post.published_at || post.created_at);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "-" + slugifyTitle(post.title);
  }

  function frontMatter(post) {
    var d = new Date(post.published_at || post.created_at);
    var lines = ["---", "layout: post"];
    lines.push('title: "' + String(post.title || "").replace(/"/g, '\\"') + '"');
    lines.push(
      "date: " +
        d.getFullYear() +
        "-" +
        pad(d.getMonth() + 1) +
        "-" +
        pad(d.getDate()) +
        " " +
        pad(d.getHours()) +
        ":" +
        pad(d.getMinutes()) +
        ":" +
        pad(d.getSeconds()),
    );
    if (post.tags && post.tags.length) {
      lines.push("tags:");
      post.tags.forEach(function (tag) {
        lines.push("- " + tag);
      });
    }
    if (post.series_name) lines.push("series: " + post.series_name);
    if (post.status === "draft") lines.push("draft: true");
    lines.push("---", "");
    return lines.join("\n") + "\n";
  }

  /** 站内图片绝对路径 -> 同目录相对路径（md 与图放在一起，Jekyll 底稿的写法） */
  function rewriteImages(md, folder) {
    return String(md || "").replace(/\/media\/([A-Za-z0-9._-]+)/g, "./" + folder + "/$1");
  }

  function collectRefs(md) {
    return String(md || "").match(/\/media\/[A-Za-z0-9._-]+/g) || [];
  }

  // ── 进度 UI ──
  function createOverlay() {
    var el = document.createElement("div");
    el.className = "export-overlay";
    el.innerHTML =
      '<div class="export-card" role="status" aria-live="polite">' +
      '<p class="export-card__title">正在导出 zip</p>' +
      '<div class="export-bar"><div class="export-bar__fill" data-export-fill></div></div>' +
      '<p class="export-card__status" data-export-status>准备中…</p>' +
      '<p class="export-card__hint">文章多、图片大时需要一两分钟，请不要关闭页面</p>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function setStatus(overlay, text, percent) {
    var status = overlay.querySelector("[data-export-status]");
    var fill = overlay.querySelector("[data-export-fill]");
    if (status) status.textContent = text;
    if (fill) fill.style.width = Math.max(2, Math.min(100, percent || 0)) + "%";
  }

  function removeOverlay(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // ── 主流程 ──
  async function exportZip(button) {
    var overlay = createOverlay();
    var original = button ? button.textContent : "";
    if (button) button.disabled = true;
    try {
      setStatus(overlay, "读取文章…", 4);
      var res = await fetch("/api/admin/export", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("读取文章失败 HTTP " + res.status);
      var data = await res.json();
      var posts = data.posts || [];
      if (!posts.length) {
        removeOverlay(overlay);
        window.alert("还没有文章可以导出");
        return;
      }

      // 目录去重：标题与日期都相同的两篇不能互相覆盖
      var usedFolders = {};
      var refsSet = {};
      posts.forEach(function (post) {
        var base = folderName(post);
        var folder = base;
        var n = 2;
        while (usedFolders[folder]) {
          folder = base + "-" + n;
          n += 1;
        }
        usedFolders[folder] = true;
        post.__folder = folder;
        collectRefs(post.content_md).forEach(function (ref) {
          refsSet[ref] = true;
        });
      });

      var keys = Object.keys(refsSet);
      var images = {};
      var done = 0;
      var failed = 0;
      setStatus(overlay, "下载图片 0/" + keys.length, 6);

      async function worker() {
        while (keys.length) {
          var key = keys.shift();
          try {
            var r = await fetch(key);
            if (r.ok) images[key] = new Uint8Array(await r.arrayBuffer());
            else failed++;
          } catch (e) {
            failed++;
          }
          done++;
          if (done % 8 === 0 || done === Object.keys(refsSet).length) {
            setStatus(overlay, "下载图片 " + done + "/" + (done + keys.length), 6 + (done / (done + keys.length)) * 78);
          }
        }
      }
      var total = Object.keys(refsSet).length;
      if (total === 0) setStatus(overlay, "打包中…", 84);
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);

      setStatus(overlay, "生成 md 与目录…", 86);
      var encoder = new TextEncoder();
      var entries = [];
      posts.forEach(function (post) {
        var folder = post.__folder;
        var body = rewriteImages(post.content_md, folder);
        entries.push({ name: "_posts/" + folder + ".md", data: encoder.encode(frontMatter(post) + body) });
        // 同一篇里同一张图可能被引用多次，只写一份
        var written = {};
        collectRefs(post.content_md).forEach(function (ref) {
          var bytes = images[ref];
          if (!bytes) return;
          var fileName = ref.split("/").pop();
          if (written[fileName]) return;
          written[fileName] = true;
          entries.push({ name: "_posts/" + folder + "/" + fileName, data: bytes });
        });
      });

      var readme = [
        "猫窝博客（miao-blog）全站导出",
        "========================================",
        "",
        "站点：" + (data.site ? data.site.name : "miao-blog"),
        "导出时间：" + new Date().toISOString(),
        "文章：" + posts.length + " 篇",
        "图片：" + (total - failed) + " 张" + (failed ? "（失败 " + failed + " 张）" : ""),
        "",
        "目录结构：",
        "  _posts/<日期-标题>.md        每篇文章，Jekyll front-matter 含 title / date / tags / series",
        "  _posts/<日期-标题>/<图片>     该文章的配图，正文里用相对路径 ./<日期-标题>/<图片> 引用",
        "  site.json                     站点与作者资料",
        "",
        "可以直接用任意 Markdown 编辑器打开 _posts 里的文件；图片是相对路径，",
        "因此把整个 _posts 目录一起移动即可正常显示。也可以作为一个 Jekyll 站点的",
        "内容目录直接使用。",
        "",
      ].join("\n");
      entries.push({ name: "README.txt", data: encoder.encode(readme) });
      if (data.site) {
        var siteCopy = Object.assign({}, data.site);
        delete siteCopy.id;
        entries.push({ name: "site.json", data: encoder.encode(JSON.stringify(siteCopy, null, 2)) });
      }

      setStatus(overlay, "打包 zip…", 94);
      var blob = buildZip(entries);
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "miao-blog-export-" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 60000);

      setStatus(overlay, "完成（" + posts.length + " 篇，" + Math.round(blob.size / 1048576) + " MB）", 100);
      setTimeout(function () {
        removeOverlay(overlay);
      }, 1200);
    } catch (err) {
      removeOverlay(overlay);
      window.alert("导出失败：" + (err && err.message ? err.message : err));
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-export-zip]");
    if (!btn) return;
    event.preventDefault();
    exportZip(btn);
  });
})();
