"use strict";
// Isolated, loopback-only preview. Does not open the app database or start jobs.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const recognition = require("../lib/grade-preview-recognition");
const localOcr = require("../lib/grade-preview-local-ocr");
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

async function configuration() {
  const config = { ...process.env };
  // Read only the existing AI configuration into memory; never print credentials.
  try {
    for (const line of (await fs.readFile(path.join(root, ".env"), "utf8")).split(/\r?\n/)) {
      const match = /^\s*(OPENAI_API_KEY|OPENAI_COMPLEX_MODEL|OPENAI_MODEL|GRADE_PREVIEW_MODEL)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && config[match[1]] === undefined) config[match[1]] = match[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return config;
}
function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(value));
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw Object.assign(new Error("上传内容超过大小限制。"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { const body = JSON.parse(Buffer.concat(chunks)); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body; }
  catch { throw Object.assign(new Error("请求格式无效。"), { statusCode: 400 }); }
}
function createPreviewServer({ config = {}, recognize, request = fetch, useLocalOcr = true } = {}) {
  let active = 0;
  const hasLocalOcr = useLocalOcr && localOcr.available();
  return http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || "";
      if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) return json(res, 403, { error: "预览仅供本机访问。" });
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === "/api/preview/grades/status" && req.method === "GET") return json(res, 200, { configured: Boolean(config.OPENAI_API_KEY || recognize || hasLocalOcr), syllabusConfigured: Boolean(config.OPENAI_API_KEY || recognize), provider: config.OPENAI_API_KEY || recognize ? "ai" : hasLocalOcr ? "local-ocr" : null });
      if (url.pathname === "/api/preview/grades/recognize" && req.method === "POST") {
        if (req.headers.origin !== `http://${host}` || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) return json(res, 403, { error: "请在本地预览页面上传文件。" });
        const body = await readBody(req);
        let file;
        try { file = recognition.upload(body); } catch (error) { return json(res, 400, { error: error.message }); }
        if (!config.OPENAI_API_KEY && !recognize && !(hasLocalOcr && file.kind === "grades")) return json(res, 503, { error: "本地尚未配置 AI 识别，可手动填写或使用示例体验确认流程。" });
        if (active >= 2) return json(res, 429, { error: "已有文件正在识别，请稍后重试。" });
        active++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        res.on("close", () => { if (!res.writableEnded) controller.abort(); });
        try {
          let output;
          if (recognize) output = await recognize(file);
          else if (!config.OPENAI_API_KEY) output = await localOcr.recognizeLocal(file, { signal: controller.signal });
          else {
            const model = config.GRADE_PREVIEW_MODEL || config.OPENAI_COMPLEX_MODEL || config.OPENAI_MODEL || "gpt-6.1-sol";
            const response = await request("https://api.openai.com/v1/responses", { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${config.OPENAI_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(recognition.requestBody(file, model)) });
            if (!response.ok) throw new Error("AI 识别暂时不可用，请稍后重试；尚未保存任何成绩。");
            output = recognition.responseText(await response.json());
          }
          return json(res, 200, recognition.parseRecognition(file.kind, output));
        } catch (error) { return json(res, 502, { error: error.name === "AbortError" ? "识别超时或已取消，请重试；尚未保存任何信息。" : error.message }); }
        finally { active--; clearTimeout(timeout); }
      }
      if (!["GET", "HEAD"].includes(req.method)) return json(res, 405, { error: "不支持此操作。" });
      const pathname = url.pathname === "/" ? "/grade-planner-preview.html" : url.pathname;
      const assets = new Set(["/grade-planner-preview.html", "/grade-planner-preview.css", "/grade-planner-preview.js", "/grade-planner-model.js", "/style.css", "/typography.css", "/appearance.css", "/display-modes.css", "/brand/icon-monochrome.svg", "/brand/icon-color.svg", "/fonts/inter-variable-4.1.woff2", "/fonts/noto-sans-sc-gb2312-v2.004.woff2"]);
      if (!assets.has(pathname)) return json(res, 404, { error: "此服务仅提供成绩模块的本地预览。" });
      const file = path.join(publicDir, pathname);
      const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" }[path.extname(file)];
      const content = await fs.readFile(file);
      res.writeHead(200, { "content-type": mime, "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'", "referrer-policy": "no-referrer" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) { json(res, error.statusCode || (error.code === "ENOENT" ? 404 : 500), { error: error.statusCode ? error.message : "本地预览请求失败，请重试。" }); }
  });
}
if (require.main === module) {
  configuration().then((config) => {
    const server = createPreviewServer({ config });
    server.on("error", (error) => { console.error(`无法启动本地预览：${error.message}`); process.exitCode = 1; });
    server.listen(Number(process.env.GRADE_PREVIEW_PORT || 4317), "127.0.0.1", () => console.log(`StudyBridge grade preview: http://127.0.0.1:${server.address().port}`));
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }).catch(() => { console.error("无法读取本地 AI 配置，请检查配置文件权限。"); process.exitCode = 1; });
}
module.exports = { createPreviewServer };
