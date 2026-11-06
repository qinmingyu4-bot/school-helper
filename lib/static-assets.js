"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const gzip = promisify(zlib.gzip), brotli = promisify(zlib.brotliCompress);
const hash = (body) => crypto.createHash("sha256").update(body).digest("hex").slice(0, 24);

function encodingFor(header, compressible) {
  const weights = new Map();
  for (const part of String(header || "").toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    weights.set(name, Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0);
  }
  const weight = (name) => weights.get(name) ?? (name === "identity" ? (weights.get("*") === 0 ? 0 : 1) : weights.get("*") ?? 0);
  const choices = compressible ? ["br", "gzip", "identity"] : ["identity"];
  return choices.filter((name) => weight(name) > 0).sort((a, b) => weight(b) - weight(a))[0];
}

// Public files are a per-process release snapshot. Restart after editing them.
// Cache keys are normalized file paths, never user-controlled query strings.
function createStaticAssets(directory, mimeTypes) {
  const files = new Map(), bundles = new Set();
  function asset(body, extension) {
    return { body, extension, hash: hash(body), encodings: new Map() };
  }
  async function read(name) {
    if (files.has(name)) return files.get(name);
    const filename = path.resolve(directory, `.${name}`);
    if (!filename.startsWith(path.resolve(directory) + path.sep)) throw new Error("Invalid public asset path");
    const body = await fs.readFile(filename);
    const result = asset(body, path.extname(name).toLowerCase());
    files.set(name, result);
    return result;
  }
  async function prepare() {
    for (const name of ["/index.html", "/landing.html"]) {
      let html = (await read(name)).body.toString();
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="(\/[^"\s]+)"[^>]*>\s*<\/script>/g)];
      const sources = [];
      for (const script of scripts) {
        const file = new URL(script[1], "http://localhost").pathname;
        // Preserve dependency order and statement boundaries, including UMD libraries.
        sources.push(`\n;/* ${file} */\n` + (await read(file)).body.toString().replace(/^\/\/# sourceMappingURL=.*$/gm, ""));
      }
      if (sources.length) {
        const bundle = asset(Buffer.from(sources.join("\n")), ".js");
        const url = `/assets/${name === "/index.html" ? "app" : "landing"}.${bundle.hash}.js`;
        files.set(url, bundle); bundles.add(url);
        for (let index = 0; index < scripts.length; index++) {
          html = html.replace(scripts[index][0], index === 0 ? `<script src="${url}" defer></script>` : "");
        }
      }
      // Preserve the entire cascade, including the inline base styles. Relative
      // KaTeX font URLs must continue to resolve from their original directory.
      const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*\brel="stylesheet"[^>]*>/g)];
      const sheets = [];
      for (const style of styles) {
        const tag = style[0].slice(0, style[0].indexOf(">") + 1);
        const href = tag.match(/\bhref="([^"]+)"/)?.[1];
        const pathname = href ? new URL(href, "http://localhost").pathname : name;
        let css = href ? (await read(pathname)).body.toString() : style[1];
        if (/@import\s/i.test(css)) throw new Error(`Bundle styles must not use @import: ${pathname}`);
        css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g, (original, double, single, bare) => {
          const value = (double ?? single ?? bare).trim();
          if (/^(?:[a-z]+:|\/|#)/i.test(value)) return original;
          const resolved = new URL(value, `http://localhost${pathname}`);
          return `url("${resolved.pathname}${resolved.search}${resolved.hash}")`;
        });
        const media = tag.match(/\bmedia="([^"]+)"/)?.[1];
        sheets.push(media ? `@media ${media} {\n${css}\n}` : css);
      }
      if (sheets.length) {
        const bundle = asset(Buffer.from(sheets.join("\n")), ".css");
        const url = `/assets/${name === "/index.html" ? "app" : "landing"}.${bundle.hash}.css`;
        files.set(url, bundle); bundles.add(url);
        for (let index = 0; index < styles.length; index++) {
          html = html.replace(styles[index][0], index === 0 ? `<link rel="stylesheet" href="${url}" />` : "");
        }
      }
      // Only content-addressed resources receive immutable caching. Old/manual ?v=
      // URLs revalidate, so forgetting a release-version bump cannot freeze an asset.
      const references = [...html.matchAll(/\b(src|href)="(\/[^"\s]+)"/g)];
      for (const match of references) {
        const url = new URL(match[2].replaceAll("&amp;", "&"), "http://localhost");
        if (bundles.has(url.pathname) || !/\.(?:css|js|svg)$/.test(url.pathname)) continue;
        const resource = await read(url.pathname);
        html = html.replace(match[0], `${match[1]}="${url.pathname}?asset=${resource.hash}"`);
      }
      files.set(name, asset(Buffer.from(html), ".html"));
    }
  }
  async function send(req, res, name, url) {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" }); return res.end();
    }
    const file = await read(name);
    const html = file.extension === ".html", worker = name === "/push-worker.js";
    const immutable = !html && !worker && (bundles.has(name) || url.searchParams.get("asset") === file.hash || file.extension === ".woff2");
    const headers = {
      "content-type": mimeTypes[file.extension] || "application/octet-stream",
      "cache-control": html || worker ? "no-store" : immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      vary: "Accept-Encoding"
    };
    const encoding = encodingFor(req.headers["accept-encoding"], /\.(?:html|js|css|svg|json|txt)$/.test(file.extension) && file.body.length >= 512);
    if (!encoding) { res.writeHead(406, { "cache-control": "no-store", vary: "Accept-Encoding" }); return res.end(); }
    if (encoding !== "identity") headers["content-encoding"] = encoding;
    if (!html && !worker) {
      headers.etag = `W/"${file.hash}"`;
      const tags = String(req.headers["if-none-match"] || "").split(",").map((tag) => tag.trim().replace(/^W\//, ""));
      if (tags.includes("*") || tags.includes(`"${file.hash}"`)) { res.writeHead(304, headers); return res.end(); }
    }
    let body = file.body;
    if (encoding !== "identity") {
      if (!file.encodings.has(encoding)) file.encodings.set(encoding, encoding === "br"
        ? brotli(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }) : gzip(body));
      body = await file.encodings.get(encoding);
    }
    res.writeHead(200, { ...headers, "content-length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  }
  return { prepare, send };
}

module.exports = { createStaticAssets, encodingFor };
