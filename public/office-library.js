(function () {
  "use strict";
  const ui = typeof module === "object" && module.exports ? require("./i18n") : window.StudyBridgeI18n;
  const names = { docs: "SB Docs", sheets: "SB Sheets", slides: "SB Slides" };
  const labels = { preparing: "准备中", generating: "生成中", checking: "检查文件中", ready: "已完成", failed: "生成失败", canceled: "已取消" };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function items(kind, projects, jobs, draft) {
    const result = projects.filter(p => p.kind === kind).map(p => ({ id: p.id, name: p.name, source: "editor", version: p.version, updatedAt: p.updatedAt || p.createdAt, format: { docs: "docx", sheets: "xlsx", slides: "pptx" }[kind] }));
    for (const job of jobs) {
      if (job.kind !== "document" || job.cheatsheet || !(kind === "docs" ? ["docx", "pdf"].includes(job.format) : job.format === (kind === "sheets" ? "xlsx" : "pptx"))) continue;
      const file = job.files?.find(f => f.extension === job.format);
      result.push({ id: job.id, name: file?.name || job.request || job.prompt || ui.text("未命名作品"), source: "ai", status: job.status, updatedAt: job.updatedAt || job.createdAt, format: job.format, file, preview: job.status === "ready" ? job.files?.find(f => f.extension === "png") : null, summary: job.summary || job.request || job.prompt || "" });
    }
    if (draft?.kind === kind && draft.id) {
      const index = result.findIndex(p => p.source === "editor" && p.id === draft.id);
      if (index >= 0) result.splice(index, 1);
      result.push({ id: draft.id, name: draft.name, source: "draft", updatedAt: draft.updatedAt, format: { docs: "docx", sheets: "xlsx", slides: "pptx" }[kind] });
    }
    return result.sort((a, b) => (b.source === "draft") - (a.source === "draft") || (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || String(a.name).localeCompare(String(b.name)));
  }
  function filtered(rows, query, source) {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter(row => (!needle || String(row.name).toLocaleLowerCase().includes(needle)) && (source === "all" || (source === "editor" ? row.source !== "ai" : row.source === "ai")));
  }
  // Small, read-only first-page illustrations. Never execute the editor, formulas,
  // embedded HTML, links or remote image URLs to paint a library thumbnail.
  function preview(kind, model) {
    if (!model) return "";
    const number = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : fallback;
    const color = (v, fallback) => /^#[\da-f]{6}$/i.test(v || "") ? v : fallback;
    const wrap = (value, width, max = 40) => {
      const lines = []; let line = "", used = 0;
      for (const c of String(value ?? "").slice(0, 8000)) {
        const size = c.charCodeAt(0) > 255 ? 1 : .52;
        if (c === "\n" || used + size > width) { lines.push(line); line = ""; used = 0; if (lines.length >= max) return lines; }
        if (c !== "\n") { line += c; used += size; }
      }
      if (line) lines.push(line);
      return lines;
    };
    const text = (value, x, y, size = 14, extra = "") => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(value)}</text>`;
    let imageBudget = 1200000;
    const image = (src, x, y, w, h) => {
      if (typeof src !== "string" || src.length >= 600000 || src.length > imageBudget || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) return "";
      imageBudget -= src.length;
      return `<image href="${esc(src)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
    };
    let content = "", height = 760;
    if (kind === "docs") {
      let y = 64, count = 0;
      const plain = (node, depth = 0) => depth > 12 ? "" : node.type === "text" ? String(node.text || "").slice(0, 8000) : node.type === "hardBreak" ? "\n" : (node.content || []).slice(0, 100).map(n => plain(n, depth + 1)).join("");
      const visit = (node, depth = 0) => {
        if (!node || depth > 12 || ++count > 400 || y > 710) return;
        if (node.type === "image") { content += image(node.attrs?.src, 54, y, 492, 180); y += 195; }
        else if (["paragraph", "heading", "tableRow"].includes(node.type)) {
          const size = node.type === "heading" ? (node.attrs?.level === 1 ? 25 : 20) : 14;
          const value = node.type === "tableRow" ? (node.content || []).map(n => plain(n)).join("   ·   ") : plain(node);
          for (const line of wrap(value, 492 / size)) { if (y > 710) break; content += text(line, 54, y, size, node.type === "heading" ? 'font-weight="600"' : ""); y += size * 1.65; }
          y += 12;
        } else (node.content || []).slice(0, 100).forEach(n => visit(n, depth + 1));
      };
      visit(model.content);
    } else if (kind === "sheets") {
      const cells = model.sheets?.[0]?.cells || {};
      content += '<path d="M0 0H600V30H0Z M0 0H30V760H0Z" fill="#f4f5f6"/>';
      for (let col = 0; col < 7; col++) content += text(String.fromCharCode(65 + col), 67 + col * 82, 20, 12, 'text-anchor="middle" fill="#697079"');
      for (let row = 1; row <= 24; row++) {
        const y = 30 + row * 30;
        content += `<path d="M0 ${y}H600" stroke="#e3e6e8"/>` + text(row, 15, y - 10, 11, 'text-anchor="middle" fill="#697079"');
        for (let col = 0; col < 7; col++) {
          const cell = cells[`${String.fromCharCode(65 + col)}${row}`];
          // Formulas remain text: previewing must never recalculate a workbook.
          const line = wrap(cell?.value ?? "", 6, 1)[0] || "";
          content += text(line, 35 + col * 82, y - 10, 12);
        }
      }
      for (let col = 0; col <= 7; col++) content += `<path d="M${30 + col * 82} 0V760" stroke="#e3e6e8"/>`;
    } else if (kind === "slides") {
      height = 337.5;
      const slide = model.slides?.[0];
      content += `<rect width="600" height="${height}" fill="${color(slide?.background, "#ffffff")}"/>`;
      for (const el of (slide?.elements || []).slice(0, 100)) {
        const x = number(el.x, 5, 0, 100) * 6, y = number(el.y, 5, 0, 100) * height / 100;
        const w = number(el.w, 40, 3, 100) * 6, h = number(el.h, 20, 3, 100) * height / 100;
        if (el.type === "image") content += image(el.src, x, y, w, h);
        else if (el.type === "text") {
          const size = number(el.size, 24, 8, 96) * .625, align = el.align === "center" ? "middle" : el.align === "right" ? "end" : "start";
          const tx = x + (align === "middle" ? w / 2 : align === "end" ? w : 0);
          wrap(el.text, w / size, Math.max(1, Math.floor(h / (size * 1.3)))).forEach((line, i) => { content += text(line, tx, y + size + i * size * 1.3, size, `text-anchor="${align}" fill="${color(el.color, "#20242a")}" font-weight="${el.bold ? 600 : 400}"`); });
        }
      }
    } else return "";
    return `<svg viewBox="0 0 600 ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" font-family="Arial, sans-serif" fill="#20242a"><rect width="600" height="${height}" fill="#fff"/>${content}</svg>`;
  }
  if (typeof module === "object" && module.exports) { module.exports = { items, filtered, preview }; return; }

  let owner = null, state, context, host, observer;
  function use(ctx) {
    if (owner !== ctx.userId) {
      owner = ctx.userId;
      state = { projects: [], jobs: [], drafts: {}, queries: {}, sources: {}, loadedAt: 0, loaded: false, errors: [], previews: new Map(), previewPending: new Set(), previewQueue: [] };
    }
    return state;
  }
  const html = () => ui.html`<section class="office-library" id="officeLibraryHost" aria-label="文件库"></section>`;
  function fileURL(row) {
    return `/api/creative/${encodeURIComponent(row.id)}/files/${encodeURIComponent(row.file.id)}`;
  }
  function date(value) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(ui.getLanguage(), { year: "numeric", month: "short", day: "numeric" }).format(parsed) : "—";
  }
  const blankNames = { docs: "空白文档", sheets: "空白表格", slides: "空白演示" };
  const previewKey = row => `${row.id}:${row.version || 0}:${row.updatedAt || ""}`;
  function placeholder(row, failed = false) {
    return `<span class="office-preview-fallback"><span class="office-preview-format">${esc(row.format.toUpperCase())}</span>${row.summary ? `<span class="office-preview-summary">${esc(String(row.summary).slice(0, 240))}</span>` : ""}${failed ? `<small>${ui.text("预览暂不可用")}</small>` : ""}</span>`;
  }
  function rowsHTML(ctx, s) {
    const rows = filtered(items(ctx.tool, s.projects, s.jobs, s.drafts[ctx.tool]), s.queries[ctx.tool] || "", s.sources[ctx.tool] || "all");
    const errors = s.errors.map(message => `<p class="office-library-error" role="alert">${esc(ui.text(message))}</p>`).join("");
    const blank = `<li class="office-library-card office-library-blank" data-library-key="new"><button class="office-card-open" data-action="office-library-new" aria-label="${ui.text(blankNames[ctx.tool])}"><span class="office-card-preview office-preview-blank" aria-hidden="true"><span>＋</span></span><span class="office-card-details"><strong>${ui.text(blankNames[ctx.tool])}</strong><span class="office-card-meta">${ui.text("新建空白文件")}</span></span></button></li>`;
    const cards = rows.map(row => {
      const action = row.source === "ai" ? "office-library-generated" : row.source === "draft" ? "office-library-resume" : "office-library-open";
      const source = row.source === "ai" ? "AI 生成" : row.source === "draft" ? "本地草稿" : "自主编辑";
      const status = row.source === "ai" && row.status !== "ready" ? ui.text(labels[row.status] || "准备中") : row.source === "draft" ? ui.text("未保存") : "";
      const key = previewKey(row), cached = s.previews.get(key);
      const thumbnail = row.preview ? `${placeholder(row)}<img src="${fileURL({ id: row.id, file: row.preview })}?inline=1" alt="" loading="lazy" decoding="async">` : row.source === "editor" && cached ? cached : placeholder(row, cached === "");
      const download = row.source === "ai" && row.status === "ready" && row.file;
      return `<li class="office-library-card office-library-file${download ? " office-card-downloadable" : ""}" data-library-key="${esc(row.source + ':' + row.id)}"><button class="office-card-open" data-action="${action}" data-id="${esc(row.id)}" aria-label="${esc(row.name)}" title="${esc(row.name)}"><span class="office-card-preview office-preview-${ctx.tool}" ${row.source === "editor" ? `data-preview-key="${esc(key)}"` : ""} aria-hidden="true">${thumbnail}</span><span class="office-card-details"><strong>${esc(row.name)}</strong><span class="office-card-meta"><span class="office-file-icon" aria-hidden="true">${esc(row.format.toUpperCase())}</span><time datetime="${esc(row.updatedAt || "")}" title="${ui.text("更新时间")}">${esc(date(row.updatedAt))}</time></span><span class="office-card-source">${ui.text(source)}${status ? ` · ${status}` : ""}</span></span></button>${download ? `<a class="office-card-download" href="${fileURL(row)}" aria-label="${esc(ui.message`下载 ${row.name}`)}" title="${ui.text("下载")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg></a>` : ""}</li>`;
    }).join("");
    const message = !s.loaded ? "正在加载文件…" : rows.length ? "" : s.queries[ctx.tool] || (s.sources[ctx.tool] && s.sources[ctx.tool] !== "all") ? "没有匹配的文件" : s.errors.length ? "暂时无法显示全部文件，请重试。" : "还没有文件，从新建空白文件开始。";
    return errors + `<ul class="office-library-grid" aria-label="${ui.text("文件库")}">${blank}${cards}</ul>${message ? `<p class="office-library-empty" role="status">${ui.text(message)}</p>` : ""}`;
  }
  function paintPreview(s, key, value, row) {
    if (s !== state || !host?.isConnected) return;
    for (const node of host.querySelectorAll("[data-preview-key]")) if (node.dataset.previewKey === key) node.innerHTML = value || placeholder(row, true);
  }
  function pumpPreviews(s, ctx) {
    if (s !== state || !host?.isConnected || context?.tool !== ctx.tool) return;
    while (s.previewPending.size < 2 && s.previewQueue.length) {
      const row = s.previewQueue.shift(), key = previewKey(row);
      if (s.previews.has(key) || s.previewPending.has(key)) continue;
      s.previewPending.add(key);
      Promise.resolve().then(() => ctx.api(`/api/office/${encodeURIComponent(row.id)}`)).then(result => {
        const value = preview(ctx.tool, result.project?.model);
        s.previews.set(key, value); paintPreview(s, key, value, row);
      }).catch(() => { s.previews.set(key, ""); paintPreview(s, key, "", row); }).finally(() => {
        s.previewPending.delete(key);
        if (s === state && context) pumpPreviews(s, context);
      });
    }
  }
  function watchPreviews(ctx, s) {
    observer?.disconnect(); s.previewQueue = [];
    const currentHost = host;
    const rows = new Map(items(ctx.tool, s.projects, [], null).map(row => [previewKey(row), row]));
    const enqueue = node => {
      if (s !== state || host !== currentHost || !host?.isConnected || context?.tool !== ctx.tool) return;
      const row = rows.get(node.dataset.previewKey);
      if (row && !s.previews.has(previewKey(row)) && !s.previewPending.has(previewKey(row))) s.previewQueue.push(row);
      pumpPreviews(s, ctx);
    };
    const nodes = host.querySelectorAll("[data-preview-key]");
    if (typeof IntersectionObserver === "undefined") { Array.from(nodes).slice(0, 6).forEach(enqueue); return; }
    const currentObserver = new IntersectionObserver(entries => {
      if (observer !== currentObserver) return;
      for (const entry of entries) if (entry.isIntersecting) { currentObserver.unobserve(entry.target); enqueue(entry.target); }
    }, { rootMargin: "100px" });
    observer = currentObserver;
    nodes.forEach(node => { if (!s.previews.has(node.dataset.previewKey)) observer.observe(node); });
    host.querySelectorAll(".office-card-preview img").forEach(img => { img.onerror = () => { img.remove(); }; });
  }
  function drawRows() {
    if (!host?.isConnected || context?.userId !== owner) return;
    const rows = host.querySelector("[data-library-rows]");
    const grid = rows.querySelector(".office-library-grid");
    const html = rowsHTML(context, state);
    if (!grid) rows.innerHTML = html;
    else {
      const next = document.createElement("template");
      next.innerHTML = html;
      const nextGrid = next.content.querySelector(".office-library-grid");
      const previous = new Map(Array.from(grid.children, node => [node.dataset.libraryKey, node]));
      const keys = new Set(Array.from(nextGrid.children, node => node.dataset.libraryKey));
      for (const [key, node] of previous) if (!keys.has(key)) node.remove();
      let cursor = grid.firstElementChild;
      for (const incoming of Array.from(nextGrid.children)) {
        const old = previous.get(incoming.dataset.libraryKey);
        const node = old?.isEqualNode(incoming) ? old : incoming;
        if (old && old !== node) {
          if (cursor === old) cursor = old.nextElementSibling;
          old.remove();
        }
        if (node !== cursor) grid.insertBefore(node, cursor);
        cursor = node.nextElementSibling;
      }
      for (const child of Array.from(rows.children)) if (child !== grid) child.remove();
      let afterGrid = false;
      for (const child of Array.from(next.content.children)) {
        if (child === nextGrid) afterGrid = true;
        else if (afterGrid) rows.append(child);
        else grid.before(child);
      }
    }
    const refresh = host.querySelector("[data-library-refresh]");
    refresh.disabled = !!state.pending;
    host.setAttribute("aria-busy", String(!!state.pending));
    watchPreviews(context, state);
  }
  async function draft(ctx) {
    const current = window.StudyBridgeOffice.pendingDraft(ctx);
    if (current) return current;
    return new Promise(resolve => {
      const request = indexedDB.open("studybridge-office", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction("drafts", "readonly"), read = tx.objectStore("drafts").get(`${ctx.userId}:${ctx.tool}`);
          tx.oncomplete = () => { const p = read.result; db.close(); resolve(p?.kind === ctx.tool ? { id: p.id, name: p.name, kind: p.kind, updatedAt: p.updatedAt } : null); };
          tx.onerror = () => { db.close(); resolve(null); };
        } catch { db.close(); resolve(null); }
      };
    }).catch(() => null);
  }
  async function load(ctx, force = false) {
    const s = use(ctx);
    if (s.pending) return s.pending;
    if (force) for (const [key, value] of s.previews) if (!value) s.previews.delete(key);
    s.pending = (async () => {
      const results = await Promise.allSettled([window.StudyBridgeOffice.list(ctx, force), ctx.api("/api/creative")]);
      if (s !== state) return;
      s.errors = [];
      if (results[0].status === "fulfilled") s.projects = results[0].value.projects || [];
      else s.errors.push("可编辑文件暂时无法加载，请刷新重试。");
      const keys = new Set(s.projects.map(previewKey));
      for (const key of s.previews.keys()) if (!keys.has(key)) s.previews.delete(key);
      if (results[1].status === "fulfilled") s.jobs = results[1].value.jobs || [];
      else s.errors.push("AI 生成文件暂时无法加载，请刷新重试。");
      s.loaded = true; s.loadedAt = Date.now();
    })().finally(() => { s.pending = null; if (s === state) drawRows(); });
    drawRows();
    return s.pending;
  }
  function mount(ctx) {
    const next = document.getElementById("officeLibraryHost"), s = use(ctx);
    if (!next || !ctx.userId) { observer?.disconnect(); s.previewQueue = []; host = null; return; }
    if (host === next && context?.tool === ctx.tool && context?.userId === ctx.userId) return;
    host = next; context = ctx;
    host.innerHTML = ui.html`<header class="office-library-header"><div><p>文件库</p><h2>${names[ctx.tool]}</h2></div><div class="office-library-create"><button data-action="office-view-generate">用 AI 创建</button></div></header><div class="office-library-controls"><input data-library-search type="search" maxlength="200" placeholder="搜索文件" aria-label="搜索文件" value="${esc(s.queries[ctx.tool] || "")}"><select data-library-source aria-label="筛选来源">${[["all", "所有来源"], ["editor", "自主编辑"], ["ai", "AI 生成"]].map(([value, label]) => `<option value="${value}" ${(s.sources[ctx.tool] || "all") === value ? "selected" : ""}>${ui.text(label)}</option>`).join("")}</select><button data-library-refresh aria-label="刷新文件">刷新</button></div><div data-library-rows aria-live="polite"></div>`;
    host.querySelector("[data-library-search]").oninput = e => { s.queries[ctx.tool] = e.target.value; drawRows(); };
    host.querySelector("[data-library-source]").onchange = e => { s.sources[ctx.tool] = e.target.value; drawRows(); };
    host.querySelector("[data-library-refresh]").onclick = () => void load(ctx, true);
    drawRows();
    void draft(ctx).then(value => { if (s === state) { s.drafts[ctx.tool] = value; drawRows(); } });
    if (!s.loaded || Date.now() - s.loadedAt >= 30000) void load(ctx);
  }
  window.StudyBridgeOfficeLibrary = { html, mount, invalidate: userId => { if (owner === userId) state.loadedAt = 0; } };
})();
