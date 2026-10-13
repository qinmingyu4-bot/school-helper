const path = require("node:path");
const AdmZip = require("adm-zip");

const formats = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png", mp4: "video/mp4"
};
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function safeName(name) {
  return path.basename(String(name || "file").replace(/\\/g, "/")).replace(/[\x00-\x1f<>:"|?*]/g, "_").slice(-160);
}

function validateFile(name, bytes) {
  const extension = path.extname(name).slice(1).toLowerCase();
  if (!formats[extension] || !bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error("生成文件格式或大小不符合要求。");
  if (extension === "png") {
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("图片文件检查未通过。");
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 10000 || height > 10000 || width * height > 32000000) throw new Error("图片尺寸检查未通过。");
  } else if (extension === "pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !bytes.subarray(-2048).includes(Buffer.from("%%EOF"))) throw new Error("PDF 文件检查未通过。");
  } else if (extension === "mp4") {
    if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("视频文件检查未通过。");
  } else {
    const zip = new AdmZip(bytes);
    const entries = zip.getEntries();
    const required = { docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" }[extension];
    if (!zip.getEntry("[Content_Types].xml") || !zip.getEntry(required) || entries.length > 2000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 100 * 1024 * 1024) throw new Error("Office 文件结构检查未通过。");
    if (entries.some((entry) => /vbaProject|oleObject|externalLinks|(^|\/)\.\.(\/|$)|\.(exe|dll|js|ps1)$/i.test(entry.entryName))) throw new Error("生成文件包含不安全内容。");
    if (/macroEnabled/i.test(zip.readAsText("[Content_Types].xml"))) throw new Error("不允许生成带宏的文件。");
    if (extension === "xlsx" && !entries.some((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName))) throw new Error("表格内容为空。");
    if (extension === "pptx" && !entries.some((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))) throw new Error("演示内容为空。");
  }
  return { name: safeName(name), mime: formats[extension], extension, size: bytes.length };
}

function sourceFiles(input) {
  if (!Array.isArray(input) || input.length > 4) throw Object.assign(new Error("最多上传 4 个参考文件。"), { statusCode: 400 });
  let total = 0;
  return input.map((item) => {
    const name = safeName(item.fileName);
    const extension = path.extname(name).slice(1).toLowerCase();
    if (!["pdf", "docx", "xlsx", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg", "webp"].includes(extension)) throw Object.assign(new Error("参考文件格式不支持。"), { statusCode: 400 });
    const match = String(item.fileData || "").match(/^data:([^;,]*);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw Object.assign(new Error("参考文件内容无效。"), { statusCode: 400 });
    const bytes = Buffer.from(match[2], "base64");
    total += bytes.length;
    if (!bytes.length || bytes.length > 12 * 1024 * 1024 || total > 16 * 1024 * 1024) throw Object.assign(new Error("单文件最多 12 MB，参考文件合计最多 16 MB。"), { statusCode: 400 });
    let mime = match[1] || "application/octet-stream";
    if (extension === "png") {
      try { validateFile(name, bytes); } catch { throw Object.assign(new Error("参考图片内容无效。"), { statusCode: 400 }); }
      mime = "image/png";
    }
    if (["jpg", "jpeg"].includes(extension)) {
      if (bytes.length < 4 || bytes.toString("hex", 0, 3) !== "ffd8ff" || bytes.toString("hex", bytes.length - 2) !== "ffd9") throw Object.assign(new Error("参考图片内容无效。"), { statusCode: 400 });
      mime = "image/jpeg";
    }
    if (extension === "webp") {
      if (bytes.length < 16 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw Object.assign(new Error("参考图片内容无效。"), { statusCode: 400 });
      mime = "image/webp";
    }
    return { name, bytes, mime, extension };
  });
}

module.exports = { formats, MAX_FILE_BYTES, safeName, validateFile, sourceFiles };
