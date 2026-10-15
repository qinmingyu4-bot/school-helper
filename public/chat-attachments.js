(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeChatAttachments = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function isPreviewUrl(url) {
    return typeof url === "string" && (/^\/api\/courses\/[^/?#]+\/attachments\/[^/?#]+\?index=\d+$/.test(url)
      || /^blob:https?:\/\/[^\s"'<>]+$/.test(url));
  }
  function render(attachments = []) {
    if (!Array.isArray(attachments) || !attachments.length) return "";
    return '<div class="chat-attachments" aria-label="已上传的附件">' + attachments.map((item) => {
      const name = escape(item.name || "附件");
      if (item.kind === "image" && isPreviewUrl(item.url)) {
        return `<button type="button" class="chat-image" data-action="view-chat-image" data-image-url="${escape(item.url)}" data-image-name="${name}" aria-label="查看图片：${name}"><img src="${escape(item.url)}" alt="${name}" loading="lazy" decoding="async"><span>${name}</span></button>`;
      }
      return `<span class="chat-file"><span aria-hidden="true">附件</span> ${name}</span>`;
    }).join("") + "</div>";
  }
  return { render, isPreviewUrl };
});
