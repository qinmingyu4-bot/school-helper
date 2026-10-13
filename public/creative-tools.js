(function () {
  "use strict";
  const labels = { preparing: "准备中", generating: "生成中", checking: "检查文件中", ready: "已完成", failed: "生成失败", canceled: "已取消" };
  const active = (job) => ["preparing", "generating", "checking"].includes(job.status);
  let userId = "", jobs = [], capabilities = { video: false, configured: true }, selectedId = "", timer = 0, focus = null;
  let context, loading = false, submitting = false, error = "", drafts = {}, skipCapture = false;
  const icon = (id) => `<svg aria-hidden="true"><use href="/classmates-icons.svg#${id}"></use></svg>`;
  function use(ctx) {
    context = ctx;
    if (userId !== ctx.userId) {
      clearTimeout(timer); userId = ctx.userId; jobs = []; selectedId = ""; drafts = {}; error = ""; loading = false;
    }
    return drafts[ctx.tool] ||= { prompt: "", courseId: "", format: ctx.tool === "sheets" ? "xlsx" : ctx.tool === "slides" ? "pptx" : "docx", size: "1024x1024", quality: "medium", parentId: "", files: [] };
  }
  function fileUrl(job, file, inline = false) { return `/api/creative/${job.id}/files/${file.id}${inline ? "?inline=1" : ""}`; }
  function capture() {
    if (skipCapture) { skipCapture = false; return; }
    if (!context || !document.getElementById("creativePrompt")) return;
    const draft = use(context);
    for (const [id, key] of [["creativePrompt", "prompt"], ["creativeFormat", "format"], ["creativeCourse", "courseId"], ["creativeSize", "size"], ["creativeQuality", "quality"]]) {
      const element = document.getElementById(id);
      if (element) draft[key] = element.value;
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
    const image = ctx.tool === "images", video = ctx.tool === "video";
    const matching = jobs.filter((job) => image ? job.kind === "image" : video ? job.kind === "video" : job.kind === "document" && (ctx.tool === "sheets" ? job.format === "xlsx" : ctx.tool === "slides" ? job.format === "pptx" : ["docx", "pdf"].includes(job.format)));
    const selected = matching.find((job) => job.id === selectedId) || matching[0];
    const pending = jobs.find(active);
    const parent = jobs.find((job) => job.id === draft.parentId);
    const blocked = video && !capabilities.video;
    const previews = selected?.status === "ready" ? selected.files?.filter((file) => file.extension === "png") || [] : [];
    return `<section class="creative-workspace">
      <div class="creative-input">
        <div class="creative-heading"><h2>${image ? "图片" : video ? "视频" : ctx.tool === "sheets" ? "Excel 表格" : ctx.tool === "slides" ? "PowerPoint 演示" : "文档"}</h2></div>
        ${parent ? `<div class="creative-revision"><span>修改上一版 · ${esc(parent.format.toUpperCase())}</span><button class="creative-icon" data-action="creative-new" title="取消修改，创建新作品" aria-label="创建新作品">${icon("back")}</button></div>` : ""}
        <label for="creativePrompt">${parent ? "修改要求" : "生成要求"}</label>
        <textarea id="creativePrompt" maxlength="6000" rows="7" placeholder="${image ? "描述画面、风格和需要保留的细节" : video ? "描述场景、镜头与动作" : "填写主题、用途、语言、篇幅和格式要求"}">${esc(draft.prompt)}</textarea>
        <div class="creative-settings">
          ${image ? `<label>尺寸<select id="creativeSize">${[["1024x1024", "正方形"], ["1536x1024", "横向"], ["1024x1536", "纵向"]].map(([value, label]) => `<option value="${value}" ${draft.size === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>质量<select id="creativeQuality">${[["low", "标准"], ["medium", "精细"], ["high", "高质量"]].map(([value, label]) => `<option value="${value}" ${draft.quality === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>` : !video ? `${ctx.tool === "docs" ? `<label>格式<select id="creativeFormat"><option value="docx" ${draft.format === "docx" ? "selected" : ""}>Word (.docx)</option><option value="pdf" ${draft.format === "pdf" ? "selected" : ""}>PDF (.pdf)</option></select></label>` : ""}<label>课程资料<select id="creativeCourse"><option value="">不使用课程资料</option>${ctx.courses.map((course) => `<option value="${esc(course.id)}" ${draft.courseId === course.id ? "selected" : ""}>${esc(course.name)}</option>`).join("")}</select></label>` : ""}
        </div>
        <label class="creative-upload">${icon("attach")}<span>${image ? "参考图片" : "参考文件"}</span><input id="creativeFiles" type="file" multiple accept="${image ? ".png,.jpg,.jpeg,.webp" : ".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"}" ${blocked ? "disabled" : ""}></label>
        ${draft.files.length ? `<div class="creative-sources">${draft.files.map((file) => `<span>${esc(file.name)}</span>`).join("")}<button class="creative-icon" data-action="creative-clear-files" title="移除参考文件" aria-label="移除参考文件">${icon("trash")}</button></div>` : ""}
        <div class="creative-submit"><button class="primary" data-action="creative-generate" ${blocked || pending || submitting ? "disabled" : ""}>${icon("send")}${submitting ? "提交中" : blocked ? "暂未开放" : parent ? "生成修改版" : "生成"}</button>${pending ? `<button class="creative-icon" data-action="creative-cancel" data-id="${pending.id}" title="取消生成" aria-label="取消生成">${icon("stop")}</button><span role="status"><span class="reply-spinner" aria-hidden="true"></span>${labels[pending.status]}</span>` : ""}</div>
        ${error ? `<p class="creative-error" role="alert">${esc(error)}</p>` : ""}
        <div class="creative-history-heading"><h3>作品记录</h3><button class="creative-icon" data-action="creative-refresh" title="刷新记录" aria-label="刷新记录">${icon("refresh")}</button></div>
        <div class="creative-history">${matching.length ? matching.map((job) => `<button class="creative-history-item ${selected?.id === job.id ? "selected" : ""}" data-action="creative-select" data-id="${job.id}"><span>${esc(job.request || job.prompt)}</span><small>${job.format.toUpperCase()} · ${labels[job.status] || "准备中"}</small></button>`).join("") : `<p class="muted">暂无作品</p>`}</div>
      </div>
      <div class="creative-result">
        <div class="creative-result-heading"><h2>${selected ? selected.format.toUpperCase() : "预览"}</h2>${selected ? `<div class="creative-result-actions">${selected.status === "ready" ? `<button class="creative-icon" data-action="creative-revise" data-id="${selected.id}" title="继续修改" aria-label="继续修改">${icon("refresh")}</button>` : ""}${!active(selected) ? `<button class="creative-icon" data-action="creative-delete" data-id="${selected.id}" title="删除作品" aria-label="删除作品">${icon("trash")}</button>` : ""}</div>` : ""}</div>
        ${selected ? `<p class="creative-result-status" role="status">${active(selected) ? '<span class="reply-spinner" aria-hidden="true"></span>' : ""}${labels[selected.status] || "准备中"}</p>${selected.error ? `<p class="creative-error" role="alert">${esc(selected.error)}</p>` : ""}${selected.files?.length ? `<div class="creative-downloads">${selected.files.map((file) => `<a href="${fileUrl(selected, file)}" class="creative-download" title="下载 ${esc(file.name)}">${icon("download")}<span>${esc(file.name)}</span><small>${Math.max(1, Math.round(file.size / 1024))} KB</small></a>`).join("")}</div>` : ""}${selected.summary ? `<div class="creative-summary">${window.StudyBridgeMarkdown.render(selected.summary)}</div>` : ""}${selected.kind === "video" && selected.status === "ready" ? `<video controls preload="metadata" src="${fileUrl(selected, selected.files[0], true)}"></video>` : previews.map((file) => `<figure class="creative-preview"><a href="${fileUrl(selected, file, true)}" target="_blank" rel="noopener noreferrer" title="放大预览"><img src="${fileUrl(selected, file, true)}" alt="${esc(file.name)}" loading="lazy"></a></figure>`).join("")}` : `<div class="creative-empty">${blocked ? "视频生成暂未开放" : "暂无预览"}</div>`}
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
        submitting = true; refresh(ctx);
        try {
          const submitted = { ...draft, files: [...draft.files] };
          const attachments = await ctx.readFiles(submitted.files);
          const { job } = await ctx.api("/api/creative", { method: "POST", body: { kind: ctx.tool === "images" ? "image" : ctx.tool === "video" ? "video" : "document", format: submitted.format, prompt: submitted.prompt, parentId: submitted.parentId, courseId: ctx.tool === "images" || ctx.tool === "video" ? "" : submitted.courseId, size: submitted.size, quality: submitted.quality, attachments } });
          jobs.unshift(job); selectedId = job.id; draft.files = []; draft.parentId = "";
        } finally { submitting = false; }
      } else if (action === "creative-select") selectedId = id;
      else if (action === "creative-cancel") await ctx.api(`/api/creative/${id}/cancel`, { method: "POST" });
      else if (action === "creative-delete") {
        if (!confirm("确定删除这份作品及其文件吗？")) return;
        await ctx.api(`/api/creative/${id}`, { method: "DELETE" }); jobs = jobs.filter((job) => job.id !== id);
        if (draft.parentId === id) draft.parentId = "";
      } else if (action === "creative-revise") {
        const parent = jobs.find((job) => job.id === id);
        draft.parentId = id; draft.prompt = ""; draft.files = [];
        draft.format = parent?.format || draft.format; draft.courseId = parent?.courseId || "";
        draft.size = parent?.size || draft.size; draft.quality = parent?.quality || draft.quality;
      }
      else if (action === "creative-new") { draft.parentId = ""; draft.prompt = ""; }
      else if (action === "creative-clear-files") draft.files = [];
      else if (action === "creative-refresh") await load(ctx);
    } catch (failure) { error = failure.message; }
    if (ctx.visible()) refresh(ctx);
    schedule();
  }
  document.addEventListener("change", (event) => {
    if (event.target.id !== "creativeFiles" || !context) return;
    capture(); use(context).files = Array.from(event.target.files || []); context.render();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  window.StudyBridgeCreativeTools = { html, load, handle, capture, restoreFocus, stop: () => clearTimeout(timer), videoEnabled: () => capabilities.video };
})();
