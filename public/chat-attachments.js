(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeChatAttachments = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  let clipboardSequence = 0;
  function clipboardImages(data) {
    const imageType = /^image\/(png|jpeg|webp|gif|avif|bmp)$/i;
    const items = Array.from(data?.items || []).filter((item) => item.kind === "file" && imageType.test(item.type || ""));
    const images = items.map((item) => item.getAsFile?.()).filter(Boolean);
    const files = images.length ? images : Array.from(data?.files || []);
    return files.filter((file) => imageType.test(file.type || "")).map((file) => {
      const extension = file.type.toLowerCase().split("/")[1].replace("jpeg", "jpg");
      // Screenshot clipboards usually call every image image.png. Give each paste
      // its own identity so a second screenshot is not mistaken for the first.
      const now = Date.now();
      const name = !file.name || /^(image|blob|clipboard)(\.[a-z0-9]+)?$/i.test(file.name)
        ? `截图-${now}-${++clipboardSequence}.${extension}` : file.name;
      return new File([file], name, { type: file.type, lastModified: now + ++clipboardSequence });
    });
  }
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
  return { render, isPreviewUrl, clipboardImages };
});
