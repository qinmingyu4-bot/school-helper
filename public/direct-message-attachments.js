(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeDirectAttachments = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const fileBytes = 12 * 1024 * 1024, totalBytes = 20 * 1024 * 1024, maxFiles = 6;
  const requestBytes = Math.ceil(totalBytes / 3) * 4 + 64 * 1024;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const isUrl = (url) => typeof url === "string" && /^\/api\/classmates\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+\?index=\d+$/.test(url);
  const sizeLabel = (size) => size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  function addFiles(current, incoming) {
    const next = [...current], seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of Array.from(incoming || [])) {
      if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("文件为空，无法发送。");
      if (file.size > fileBytes) throw new Error(`文件太大：${file.name}。单文件最大 12 MB。`);
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!seen.has(key)) { next.push(file); seen.add(key); }
    }
    if (next.length > maxFiles) throw new Error("每次最多发送 6 个附件。");
    if (next.reduce((sum, file) => sum + file.size, 0) > totalBytes) throw new Error("附件合计最大 20 MB，请分次发送。");
    return next;
  }
  function render(attachments = []) {
    if (!Array.isArray(attachments) || !attachments.length) return "";
    return '<div class="dm-attachments" aria-label="消息附件">' + attachments.filter((item) => isUrl(item.url)).map((item) => {
      const name = escape(item.name || "附件"), url = escape(item.url);
      const image = item.kind === "image" ? `<button type="button" class="dm-image" data-action="view-chat-image" data-image-url="${url}" data-image-name="${name}" aria-label="查看图片：${name}"><img src="${url}" alt="${name}" loading="lazy" decoding="async" width="${Number(item.width) || 240}" height="${Number(item.height) || 180}"></button>` : "";
      return `<div class="dm-attachment">${image}<a class="dm-file" href="${url}&amp;download=1" download><span aria-hidden="true">${image ? "图片" : "文件"}</span><span><b>${name}</b><small>${escape(sizeLabel(Number(item.size) || 0))} · 下载</small></span></a></div>`;
    }).join("") + "</div>";
  }
  function createDrafts({ userId, chatId, createUrl = (file) => URL.createObjectURL(file), revokeUrl = (url) => URL.revokeObjectURL(url), createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }) {
    const drafts = new Map();
    let actor;
    function reset() {
      for (const draft of drafts.values()) for (const url of draft.urls.values()) revokeUrl(url);
      drafts.clear();
    }
    function current() {
      if (actor !== userId()) { reset(); actor = userId(); }
      const key = JSON.stringify([actor, chatId()]);
      if (!drafts.has(key)) drafts.set(key, { key, userId: actor, files: [], urls: new Map(), request: null });
      return drafts.get(key);
    }
    return {
      reset,
      files: () => current().files,
      add(files) { const draft = current(); draft.files = addFiles(draft.files, files); },
      remove(index) {
        const draft = current(), file = draft.files[index];
        if (!file) return;
        draft.files.splice(index, 1);
        if (draft.urls.has(file)) { revokeUrl(draft.urls.get(file)); draft.urls.delete(file); }
      },
      preview(file) {
        if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type || "")) return "";
        const draft = current();
        if (!draft.urls.has(file)) draft.urls.set(file, createUrl(file));
        return draft.urls.get(file);
      },
      snapshot(text) {
        const draft = current();
        if (!draft.request || draft.request.text !== text || draft.request.files.length !== draft.files.length || draft.files.some((file, index) => file !== draft.request.files[index])) {
          draft.request = { key: draft.key, userId: draft.userId, text, files: [...draft.files], clientId: createId() };
        }
        return draft.request;
      },
      sent(request) {
        if (userId() !== request.userId) return;
        const draft = drafts.get(request.key);
        if (!draft) return;
        draft.files = draft.files.filter((file) => !request.files.includes(file));
        for (const file of request.files) if (draft.urls.has(file)) { revokeUrl(draft.urls.get(file)); draft.urls.delete(file); }
        if (draft.request === request) draft.request = null;
      }
    };
  }
  return { fileBytes, totalBytes, maxFiles, requestBytes, isUrl, sizeLabel, addFiles, render, createDrafts };
});
