const { imageSize } = require("image-size");
const limits = require("../public/direct-message-attachments");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const types = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp" };

function normalize(input = []) {
  if (!Array.isArray(input) || input.length > limits.maxFiles) throw fail(400, "每次最多发送 6 个附件。");
  let total = 0;
  return input.map((raw) => {
    if (!raw || typeof raw !== "object") throw fail(400, "附件内容无效，请重新选择文件。");
    const name = String(raw.fileName || "附件").toWellFormed().replace(/[\x00-\x1f\x7f/\\]/g, "_").trim().slice(0, 180).toWellFormed() || "附件";
    const data = typeof raw.fileData === "string" ? raw.fileData : "";
    if (data.length > Math.ceil(limits.fileBytes / 3) * 4 + 256) throw fail(413, "单文件最大 12 MB。");
    const match = data.match(/^data:([^;,\s]*);base64,([A-Za-z0-9+/]*={0,2})$/);
    if (!match || !match[2] || match[2].length % 4) throw fail(400, "附件内容无效，请重新选择文件。");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.toString("base64") !== match[2]) throw fail(400, "附件编码无效，请重新选择文件。");
    total += bytes.length;
    if (bytes.length > limits.fileBytes || total > limits.totalBytes) throw fail(413, "单文件最大 12 MB，附件合计最大 20 MB。");
    let dimensions;
    try { dimensions = imageSize(bytes); } catch {}
    const mime = types[dimensions?.type];
    if (mime && (!dimensions.width || !dimensions.height || dimensions.width > 16384 || dimensions.height > 16384 || dimensions.width * dimensions.height > 40000000)) throw fail(400, "图片尺寸过大，请缩小后发送。");
    if (!mime && /^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(match[1])) throw fail(400, "图片内容无效，请重新选择图片。");
    return { name, size: bytes.length, kind: mime ? "image" : "file", mime: mime || "application/octet-stream", base64: match[2],
      ...(mime ? { width: dimensions.width, height: dimensions.height } : {}) };
  });
}

function metadata(chatId, messageId, attachments) {
  return attachments.map(({ name, size, kind, mime, width, height }, index) => ({ name, size, kind, mime,
    ...(kind === "image" ? { width, height } : {}), url: `/api/classmates/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(messageId)}?index=${index}` }));
}

module.exports = { ...limits, normalize, metadata };
