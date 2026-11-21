(function () {
  "use strict";
  const ui = typeof module === "object" && module.exports ? require("./i18n") : window.StudyBridgeI18n;
  const names = { docs: "SB Docs", sheets: "SB Sheets", slides: "SB Slides" };
  const labels = { preparing: "准备中", generating: "生成中", checking: "检查文件中", ready: "已完成", failed: "生成失败", canceled: "已取消" };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function items(kind, projects, jobs, draft) {
    const result = projects.filter(p => p.kind === kind).map(p => ({ id: p.id, name: p.name, source: "editor", updatedAt: p.updatedAt || p.createdAt, format: { docs: "docx", sheets: "xlsx", slides: "pptx" }[kind] }));
    for (const job of jobs) {
      if (job.kind !== "document" || job.cheatsheet || !(kind === "docs" ? ["docx", "pdf"].includes(job.format) : job.format === (kind === "sheets" ? "xlsx" : "pptx"))) continue;
      const file = job.files?.find(f => f.extension === job.format);
      result.push({ id: job.id, name: file?.name || job.request || job.prompt || ui.text("未命名作品"), source: "ai", status: job.status, updatedAt: job.updatedAt || job.createdAt, format: job.format, file });
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
  if (typeof module === "object" && module.exports) { module.exports = { items, filtered }; return; }

  let owner = null, state, context, host;
  function use(ctx) {
    if (owner !== ctx.userId) {
      owner = ctx.userId;
      state = { projects: [], jobs: [], drafts: {}, queries: {}, sources: {}, loadedAt: 0, loaded: false, errors: [] };
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
  function rowsHTML(ctx, s) {
    const rows = filtered(items(ctx.tool, s.projects, s.jobs, s.drafts[ctx.tool]), s.queries[ctx.tool] || "", s.sources[ctx.tool] || "all");
    const errors = s.errors.map(message => `<p class="office-library-error" role="alert">${esc(ui.text(message))}</p>`).join("");
    if (!s.loaded) return errors + ui.html`<p class="office-library-empty" role="status">正在加载文件…</p>`;
    if (!rows.length) return errors + `<p class="office-library-empty">${ui.text(s.queries[ctx.tool] || (s.sources[ctx.tool] && s.sources[ctx.tool] !== "all") ? "没有匹配的文件" : s.errors.length ? "暂时无法显示全部文件，请重试。" : "还没有文件，从新建空白文件开始。")}</p>`;
    return errors + `<div class="office-library-table" role="table" aria-label="${ui.text("文件库")}"><div class="office-library-columns" role="row"><span role="columnheader">${ui.text("名称")}</span><span role="columnheader">${ui.text("来源")}</span><span role="columnheader">${ui.text("更新时间")}</span><span role="columnheader">${ui.text("操作")}</span></div>${rows.map(row => {
      const action = row.source === "ai" ? "office-library-generated" : row.source === "draft" ? "office-library-resume" : "office-library-open";
      const source = row.source === "ai" ? "AI 生成" : row.source === "draft" ? "本地草稿" : "自主编辑";
      const status = row.source === "ai" ? ui.text(labels[row.status] || "准备中") : row.source === "draft" ? ui.text("未保存") : "";
      return `<div class="office-library-row" role="row"><div role="cell" class="office-library-filename"><span class="office-file-icon" aria-hidden="true">${esc(row.format.toUpperCase())}</span><button data-action="${action}" data-id="${esc(row.id)}" title="${esc(row.name)}"><span>${esc(row.name)}</span>${status ? `<small>${status}</small>` : ""}</button></div><span class="office-library-source" role="cell">${ui.text(source)}</span><time role="cell" datetime="${esc(row.updatedAt || "")}">${esc(date(row.updatedAt))}</time><div class="office-library-row-actions" role="cell">${row.source === "ai" && row.status === "ready" && row.file ? `<a href="${fileURL(row)}" aria-label="${esc(ui.message`下载 ${row.name}`)}">${ui.text("下载")}</a>` : `<button data-action="${action}" data-id="${esc(row.id)}">${ui.text(row.source === "draft" ? "继续编辑" : row.source === "ai" ? "查看" : "打开")}</button>`}</div></div>`;
    }).join("")}</div>`;
  }
  function drawRows() {
    if (!host?.isConnected || context?.userId !== owner) return;
    host.querySelector("[data-library-rows]").innerHTML = rowsHTML(context, state);
    const refresh = host.querySelector("[data-library-refresh]");
    refresh.disabled = !!state.pending;
    host.setAttribute("aria-busy", String(!!state.pending));
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
    s.pending = (async () => {
      const results = await Promise.allSettled([window.StudyBridgeOffice.list(ctx, force), ctx.api("/api/creative")]);
      if (s !== state) return;
      s.errors = [];
      if (results[0].status === "fulfilled") s.projects = results[0].value.projects || [];
      else s.errors.push("可编辑文件暂时无法加载，请刷新重试。");
      if (results[1].status === "fulfilled") s.jobs = results[1].value.jobs || [];
      else s.errors.push("AI 生成文件暂时无法加载，请刷新重试。");
      s.loaded = true; s.loadedAt = Date.now();
    })().finally(() => { s.pending = null; if (s === state) drawRows(); });
    drawRows();
    return s.pending;
  }
  function mount(ctx) {
    const next = document.getElementById("officeLibraryHost"), s = use(ctx);
    if (!next || !ctx.userId) { host = null; return; }
    if (host === next && context?.tool === ctx.tool && context?.userId === ctx.userId) return;
    host = next; context = ctx;
    host.innerHTML = ui.html`<header class="office-library-header"><div><p>文件库</p><h2>${names[ctx.tool]}</h2></div><div class="office-library-create"><button class="office-library-new" data-action="office-library-new"><span aria-hidden="true">＋</span> 新建空白文件</button><button data-action="office-view-generate">用 AI 创建</button></div></header><div class="office-library-controls"><input data-library-search type="search" maxlength="200" placeholder="搜索文件" aria-label="搜索文件" value="${esc(s.queries[ctx.tool] || "")}"><select data-library-source aria-label="筛选来源">${[["all", "所有来源"], ["editor", "自主编辑"], ["ai", "AI 生成"]].map(([value, label]) => `<option value="${value}" ${(s.sources[ctx.tool] || "all") === value ? "selected" : ""}>${ui.text(label)}</option>`).join("")}</select><button data-library-refresh aria-label="刷新文件">刷新</button></div><div data-library-rows aria-live="polite"></div>`;
    host.querySelector("[data-library-search]").oninput = e => { s.queries[ctx.tool] = e.target.value; drawRows(); };
    host.querySelector("[data-library-source]").onchange = e => { s.sources[ctx.tool] = e.target.value; drawRows(); };
    host.querySelector("[data-library-refresh]").onclick = () => void load(ctx, true);
    drawRows();
    void draft(ctx).then(value => { if (s === state) { s.drafts[ctx.tool] = value; drawRows(); } });
    if (!s.loaded || Date.now() - s.loadedAt >= 30000) void load(ctx);
  }
  window.StudyBridgeOfficeLibrary = { html, mount, invalidate: userId => { if (owner === userId) state.loadedAt = 0; } };
})();
