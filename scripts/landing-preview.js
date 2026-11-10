"use strict";
// Public-page preview only: no database, account APIs, secrets or background jobs.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const publicDir = path.resolve(__dirname, "../public");
const assets = new Set([
  "/landing.html", "/landing.css", "/landing-grades.js", "/landing-motion.js",
  "/landing-story.js", "/landing-story.css", "/i18n-en.js", "/i18n.js",
  "/i18n-landing.js", "/i18n.css", "/typography.css", "/brand.css", "/privacy.html",
  "/brand/book-bridge-monochrome.svg", "/brand/icon-monochrome.svg",
  "/fonts/inter-variable-4.1.woff2", "/fonts/noto-sans-sc-gb2312-v2.004.woff2"
]);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
function createPreviewServer() {
  return http.createServer(async (req, res) => {
    const host = req.headers.host || "";
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) { res.writeHead(403); return res.end(); }
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); return res.end(); }
    const url = new URL(req.url, `http://${host}`);
    const pathname = url.pathname === "/" ? "/landing.html" : url.pathname;
    if (!assets.has(pathname)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return res.end(req.method === "HEAD" ? undefined : "本地介绍页预览不连接账号服务。/ Local homepage preview: account services are not connected.");
    }
    try {
      const content = await fs.readFile(path.join(publicDir, pathname));
      res.writeHead(200, { "content-type": mime[path.extname(pathname)], "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch { res.writeHead(404); res.end(); }
  });
}
if (require.main === module) {
  const server = createPreviewServer();
  server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(Number(process.env.LANDING_PREVIEW_PORT || 4318), "127.0.0.1", () => console.log(`StudyBridge homepage preview: http://127.0.0.1:${server.address().port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { server.close(); server.closeAllConnections(); });
}
module.exports = { createPreviewServer };
