(function () {
  "use strict";
  const ui = typeof module === "object" && module.exports ? require("./i18n") : globalThis.StudyBridgeI18n;

  const labels = { preparing: "准备中", generating: "生成中", checking: "检查文件中", ready: "已完成", failed: "生成失败", canceled: "已取消" };
  const active = (job) => ["preparing", "generating", "checking"].includes(job.status);
  const printSettings = window.StudyBridgeCheatsheetPrint;
  let userId = "", jobs = [], capabilities = { video: false, configured: true }, selectedId = "", timer = 0, focus = null;
  let context, loading = false, submitting = false, error = "", drafts = {}, skipCapture = false;
  const icon = (id) => `<svg aria-hidden="true"><use href="/classmates-icons.svg#${id}"></use></svg>`;
  function use(ctx) {
    context = ctx;
    if (userId !== ctx.userId) {
      clearTimeout(timer); userId = ctx.userId; jobs = []; selectedId = ""; drafts = {}; error = ""; loading = false;
    }
    const key = ctx.tool === "cheatsheet" ? `cheatsheet:${ctx.courseId}` : ctx.tool;
    return drafts[key] ||= { prompt: "", courseId: ctx.tool === "cheatsheet" ? ctx.courseId : "", format: ctx.tool === "cheatsheet" ? "pdf" : ctx.tool === "sheets" ? "xlsx" : ctx.tool === "slides" ? "pptx" : "docx", size: "1024x1024", quality: "medium", parentId: "", files: [], print: { ...printSettings.defaults } };
  }
  function fileUrl(job, file, inline = false) { return `/api/creative/${job.id}/files/${file.id}${inline ? "?inline=1" : ""}`; }
  function capture() {
    if (skipCapture) { skipCapture = false; return; }
    if (!context || !document.getElementById("creativePrompt")) return;
    const draft = use(context);
    for (const [id, key] of [["creativePrompt", "prompt"], ["creativeFormat", "format"], ["creativeCourse", "courseId"], ["creativeSize", "size"], ["creativeQuality", "quality"]]) {
      const element = document.getElementById(id);
      if (element && !(context.tool === "cheatsheet" && key === "courseId")) draft[key] = element.value;
    }
    for (const key of Object.keys(printSettings.defaults)) {
      const element = document.getElementById(`print-${key}`);
      if (element) draft.print[key] = element.type === "checkbox" ? element.checked : element.type === "number" ? Number(element.value) : element.value;
    }
    const element = document.activeElement;
    focus = element?.id === "creativePrompt" ? [element.selectionStart, element.selectionEnd] : null;
  }
  function refresh(ctx) { skipCapture = true; ctx.render(); }
  function restoreFocus() {
    const element = document.getElementById("creativePrompt");
    if (focus && element) { element.focus({ preventScroll: true }); element.setSelectionRange(...focus); }
    focus = null;
  }
  function schedule() {
    clearTimeout(timer);
    if (!context?.visible() || document.hidden || !jobs.some(active)) return;
    timer = setTimeout(() => void load(context, true), 2500);
  }
  async function load(ctx, quiet = false) {
    use(ctx);
    if (loading) return;
    loading = true;
    const owner = ctx.userId;
    try {
      const [result, config] = await Promise.all([ctx.api("/api/creative"), ctx.api("/api/creative/capabilities")]);
      if (owner !== userId) return;
      const changed = JSON.stringify(jobs) !== JSON.stringify(result.jobs || []) || JSON.stringify(capabilities) !== JSON.stringify(config);
      jobs = result.jobs || []; capabilities = config;
      if (changed && quiet && ctx.visible()) ctx.render();
    } catch (failure) { if (!quiet) error = failure.message; }
    finally { loading = false; if (owner === userId) schedule(); }
  }
  function html(ctx) {
    const draft = use(ctx), esc = ctx.esc;
    const image = ctx.tool === "images", video = ctx.tool === "video", cheat = ctx.tool === "cheatsheet";
    const matching = jobs.filter((job) => cheat ? job.cheatsheet && job.courseId === ctx.courseId : image ? job.kind === "image" : video ? job.kind === "video" : job.kind === "document" && !job.cheatsheet && (ctx.tool === "sheets" ? job.format === "xlsx" : ctx.tool === "slides" ? job.format === "pptx" : ["docx", "pdf"].includes(job.format)));
    const selected = matching.find((job) => job.id === selectedId) || matching[0];
    const pending = jobs.find(active);
    const parent = jobs.find((job) => job.id === draft.parentId);
    const missingCourse = cheat && !ctx.courses.some((course) => course.id === draft.courseId);
    const blocked = video && !capabilities.video;
    const previews = selected?.status === "ready" ? selected.files?.filter((file) => file.extension === "png") || [] : [];
    return ui.html`<section class="creative-workspace">
      <div class="creative-input">
        <div class="creative-heading"><h2>${cheat ? "Cheatsheet PDF" : image ? ui.text("图片") : video ? ui.text("视频") : ctx.tool === "sheets" ? ui.text("Excel 表格") : ctx.tool === "slides" ? ui.text("PowerPoint 演示") : ui.text("文档")}</h2>${cheat ? `<p class="creative-course-label">${esc(ctx.courses.find((course) => course.id === ctx.courseId)?.name || ui.text("未选择课程"))}</p>` : ""}</div>
        ${cheat ? ui.markup('<p class="muted">选择课程后，AI 会结合该课程已上传的资料和历史图片，并使用已保存的 Learning Style。生成后可点“继续修改”。</p>') : ""}
        ${cheat ? ui.html`<div class="creative-settings"><label for="creativeCourse">选择课程<select id="creativeCourse" aria-describedby="creativeCourseHelp"><option value="" disabled ${missingCourse ? "selected" : ""}>${ctx.courses.length ? ui.text("请选择课程") : ui.text("暂无课程")}</option>${ctx.courses.map((course) => `<option value="${esc(course.id)}" ${draft.courseId === course.id ? "selected" : ""}>${esc(course.name)}</option>`).join("")}</select></label></div><p id="creativeCourseHelp" class="muted">${missingCourse ? ui.text("请先在学习区添加课程，再选择课程制作。") : ui.text("自动读取所选课程的资料；草稿、打印设置和作品记录按课程分别保留。")}</p>` : ""}
        ${parent ? ui.html`<div class="creative-revision"><span>修改上一版 · ${esc(parent.format.toUpperCase())}</span><button class="creative-icon" data-action="creative-new" title="取消修改，创建新作品" aria-label="创建新作品">${icon("back")}</button></div>` : ""}
        <label for="creativePrompt">${parent ? ui.text("修改要求") : ui.text("生成要求")}</label>
        <textarea id="creativePrompt" maxlength="6000" rows="7" placeholder="${image ? ui.text("描述画面、风格和需要保留的细节") : video ? ui.text("描述场景、镜头与动作") : ui.text("填写主题、用途、语言、篇幅和格式要求")}">${esc(draft.prompt)}</textarea>
        ${cheat ? printForm(draft.print) : `<div class="creative-settings">
          ${image ? ui.html`<label>尺寸<select id="creativeSize">${[["1024x1024", ui.text("正方形")], ["1536x1024", ui.text("横向")], ["1024x1536", ui.text("纵向")]].map(([value, label]) => `<option value="${value}" ${draft.size === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>质量<select id="creativeQuality">${[["low", ui.text("标准")], ["medium", ui.text("精细")], ["high", ui.text("高质量")]].map(([value, label]) => `<option value="${value}" ${draft.quality === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>` : !video ? ui.html`${ctx.tool === "docs" ? ui.html`<label>格式<select id="creativeFormat"><option value="docx" ${draft.format === "docx" ? "selected" : ""}>Word (.docx)</option><option value="pdf" ${draft.format === "pdf" ? "selected" : ""}>PDF (.pdf)</option></select></label>` : ""}<label>课程资料<select id="creativeCourse"><option value="">不使用课程资料</option>${ctx.courses.map((course) => `<option value="${esc(course.id)}" ${draft.courseId === course.id ? "selected" : ""}>${esc(course.name)}</option>`).join("")}</select></label>` : ""}
        </div>`}
        <label class="creative-upload">${icon("attach")}<span>${image ? ui.text("参考图片") : ui.text("参考文件")}</span><input id="creativeFiles" type="file" multiple accept="${image ? ".png,.jpg,.jpeg,.webp" : ".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"}" ${blocked ? "disabled" : ""}></label>
        ${draft.files.length ? ui.html`<div class="creative-sources">${draft.files.map((file) => `<span>${esc(file.name)}</span>`).join("")}<button class="creative-icon" data-action="creative-clear-files" title="移除参考文件" aria-label="移除参考文件">${icon("trash")}</button></div>` : ""}
        <div class="creative-submit"><button class="primary" data-action="creative-generate" ${blocked || missingCourse || pending || submitting ? "disabled" : ""}>${icon("send")}${submitting ? ui.text("提交中") : blocked ? ui.text("暂未开放") : parent ? ui.text("生成修改版") : ui.text("生成")}</button>${pending ? ui.html`<button class="creative-icon" data-action="creative-cancel" data-id="${pending.id}" title="取消生成" aria-label="取消生成">${icon("stop")}</button><span role="status"><span class="reply-spinner" aria-hidden="true"></span>${ui.text(labels[pending.status] || "准备中")}</span>` : ""}</div>
        ${error ? `<p class="creative-error" role="alert">${esc(error)}</p>` : ""}
        <div class="creative-history-heading"><h3>作品记录</h3><button class="creative-icon" data-action="creative-refresh" title="刷新记录" aria-label="刷新记录">${icon("refresh")}</button></div>
        <div class="creative-history">${matching.length ? matching.map((job) => `<button class="creative-history-item ${selected?.id === job.id ? "selected" : ""}" data-action="creative-select" data-id="${job.id}"><span>${esc(job.request || job.prompt)}</span><small>${job.format.toUpperCase()} · ${ui.text(labels[job.status] || "准备中")}</small></button>`).join("") : ui.html`<p class="muted">暂无作品</p>`}</div>
      </div>
      <div class="creative-result">
        <div class="creative-result-heading"><h2>${selected ? selected.format.toUpperCase() : ui.text("预览")}</h2>${selected ? `<div class="creative-result-actions">${selected.status === "ready" ? ui.html`${cheat ? ui.html`<a class="creative-icon" href="${fileUrl(selected, selected.files.find((file) => file.extension === "pdf"))}?inline=1#toolbar=1" target="_blank" rel="noopener noreferrer" title="打开 PDF 查看器预览和打印" aria-label="预览和打印 PDF">${icon("print")}</a>` : ""}<button class="creative-icon" data-action="creative-revise" data-id="${selected.id}" title="继续修改" aria-label="继续修改">${icon("refresh")}</button>` : ""}${!active(selected) ? ui.html`<button class="creative-icon" data-action="creative-delete" data-id="${selected.id}" title="删除作品" aria-label="删除作品">${icon("trash")}</button>` : ""}</div>` : ""}</div>
        ${selected ? `<p class="creative-result-status" role="status">${active(selected) ? '<span class="reply-spinner" aria-hidden="true"></span>' : ""}${ui.text(labels[selected.status] || "准备中")}</p>${selected.error ? `<p class="creative-error" role="alert">${esc(selected.error)}</p>` : ""}${selected.files?.length ? `<div class="creative-downloads">${selected.files.map((file) => ui.html`<a href="${fileUrl(selected, file)}" class="creative-download" title="下载 ${esc(file.name)}">${icon("download")}<span>${esc(file.name)}</span><small>${Math.max(1, Math.round(file.size / 1024))} KB</small></a>`).join("")}</div>` : ""}${selected.summary ? `<div class="creative-summary">${window.StudyBridgeMarkdown.render(selected.summary)}</div>` : ""}${selected.kind === "video" && selected.status === "ready" ? `<video controls preload="metadata" src="${fileUrl(selected, selected.files[0], true)}"></video>` : previews.map((file) => ui.html`<figure class="creative-preview"><a href="${fileUrl(selected, file, true)}" target="_blank" rel="noopener noreferrer" title="放大预览"><img src="${fileUrl(selected, file, true)}" alt="${esc(file.name)}" loading="lazy"></a></figure>`).join("")}` : `<div class="creative-empty">${blocked ? ui.text("视频生成暂未开放") : ui.text("暂无预览")}</div>`}
      </div>
    </section>`;
  }
  async function handle(button, ctx) {
    capture();
    const draft = use(ctx), action = button.dataset.action, id = button.dataset.id;
    error = "";
    try {
      if (action === "creative-generate") {
        if (submitting) return;
        if (ctx.tool === "cheatsheet" && !ctx.courses.some((course) => course.id === draft.courseId)) throw new Error(ui.text("请先选择课程。"));
        submitting = true; refresh(ctx);
        try {
          const submitted = { ...draft, files: [...draft.files], print: { ...draft.print } };
          await ctx.beforeGenerate?.();
          const attachments = await ctx.readFiles(submitted.files);
          const { job } = await ctx.api("/api/creative", { method: "POST", body: { kind: ctx.tool === "images" ? "image" : ctx.tool === "video" ? "video" : "document", format: submitted.format, prompt: submitted.prompt, parentId: submitted.parentId, courseId: ctx.tool === "images" || ctx.tool === "video" ? "" : submitted.courseId, size: submitted.size, quality: submitted.quality, ...(ctx.tool === "cheatsheet" ? { cheatsheet: printSettings.normalize(submitted.print) } : {}), attachments } });
          jobs.unshift(job); selectedId = job.id; draft.files = []; draft.parentId = "";
        } finally { submitting = false; }
      } else if (action === "creative-select") selectedId = id;
      else if (action === "creative-cancel") await ctx.api(`/api/creative/${id}/cancel`, { method: "POST" });
      else if (action === "creative-delete") {
        if (!confirm(ui.text("确定删除这份作品及其文件吗？"))) return;
        await ctx.api(`/api/creative/${id}`, { method: "DELETE" }); jobs = jobs.filter((job) => job.id !== id);
        if (draft.parentId === id) draft.parentId = "";
      } else if (action === "creative-revise") {
        const parent = jobs.find((job) => job.id === id);
        draft.parentId = id; draft.prompt = ""; draft.files = [];
        draft.format = parent?.format || draft.format; draft.courseId = parent?.courseId || "";
        draft.size = parent?.size || draft.size; draft.quality = parent?.quality || draft.quality;
        if (parent?.cheatsheet) draft.print = { ...parent.cheatsheet };
      }
      else if (action === "creative-new") { draft.parentId = ""; draft.prompt = ""; }
      else if (action === "creative-clear-files") draft.files = [];
      else if (action === "creative-refresh") await load(ctx);
    } catch (failure) { error = failure.message; }
    if (ctx.visible()) refresh(ctx);
    schedule();
  }
  document.addEventListener("change", (event) => {
    if (!context) return;
    if (event.target.id === "creativeCourse" && context.tool === "cheatsheet") {
      capture();
      error = "";
      context.selectCourse(event.target.value);
      return;
    }
    if (event.target.id !== "creativeFiles") return;
    capture(); use(context).files = Array.from(event.target.files || []); context.render();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  function printForm(settings) {
    const select = (key, label, choices) => `<label>${label}<select id="print-${key}">${choices.map(([value, text]) => `<option value="${value}" ${settings[key] === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
    return ui.html`<div class="creative-settings cheatsheet-settings">
      ${select("paper", ui.text("纸张"), [["A4", "A4"], ["Letter", "Letter"]])}
      ${select("orientation", ui.text("方向"), [["portrait", ui.text("纵向")], ["landscape", ui.text("横向")]])}
      ${select("sides", ui.text("打印面数"), [["single", ui.text("单面")], ["double", ui.text("双面")]])}
      <label>纸张数量<input id="print-sheets" type="number" min="1" max="4" step="1" value="${settings.sheets}"></label>
      <label>分栏<input id="print-columns" type="number" min="1" max="3" step="1" value="${settings.columns}"></label>
      <label>最小字号 (pt)<input id="print-fontSize" type="number" min="8" max="14" step="0.5" value="${settings.fontSize}"></label>
      <label>边距 (mm)<input id="print-marginMm" type="number" min="5" max="20" step="1" value="${settings.marginMm}"></label>
      <label class="cheatsheet-monochrome"><input id="print-monochrome" type="checkbox" ${settings.monochrome ? "checked" : ""}>黑白版</label>
    </div>`;
  }
  window.StudyBridgeCreativeTools = { html, load, handle, capture, restoreFocus, stop: () => clearTimeout(timer), videoEnabled: () => capabilities.video };
})();
