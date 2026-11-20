const { createHash } = require("node:crypto");
const decode = require("markdown-it")().utils.unescapeAll;
const hash = (value) => createHash("sha256").update(value).digest("hex");
function allowed(value, domain) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
function htmlText(html) {
  return decode(html.replace(/<!--[^]*?-->/g, " ")
    .replace(/<(script|style|nav|footer|header)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, " [$1] ")
    .replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function createCalendarSources({ request = fetch, parsePdf, now = Date.now } = {}) {
  const cache = new Map();
  async function load(original, domain) {
    const signal = AbortSignal.timeout(15000);
    let url = original;
    for (let redirects = 0; redirects < 4; redirects++) {
      if (!allowed(url, domain)) throw new Error("Calendar source outside official domain");
      const response = await request(url, { signal, redirect: "manual", headers: { accept: "text/html,application/pdf,text/plain" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) throw new Error("Missing calendar redirect");
        url = new URL(location, url).href; continue;
      }
      if (!response.ok || Number(response.headers.get("content-length")) > 4 * 1024 * 1024) {
        await response.body?.cancel(); throw new Error("Calendar source unavailable or too large");
      }
      const parts = []; let size = 0;
      for await (const part of response.body) {
        size += part.length;
        if (size > 4 * 1024 * 1024) throw new Error("Calendar source too large");
        parts.push(Buffer.from(part));
      }
      const buffer = Buffer.concat(parts), type = response.headers.get("content-type") || "";
      let text;
      const pdf = /application\/pdf/i.test(type) || buffer.subarray(0, 5).toString() === "%PDF-";
      if (pdf) {
        if (!parsePdf) throw new Error("Calendar PDF parser unavailable");
        text = (await parsePdf(Uint8Array.from(buffer))).text;
      } else if (/text\/(html|plain)|application\/xhtml/i.test(type)) text = htmlText(buffer.toString("utf8"));
      else throw new Error("Unsupported calendar source");
      text = String(text || "").replace(/\s+/g, " ").trim();
      // Never silently truncate evidence: large or scanned sources use discovery.
      if (text.length < 80 || text.length > 60000) throw new Error("Calendar source needs deeper reading");
      return { url: original, finalUrl: url, text, digest: hash(pdf ? buffer : text) };
    }
    throw new Error("Too many calendar redirects");
  }
  async function read(url, domain) {
    if (!allowed(url, domain)) throw new Error("Invalid calendar source");
    const key = `${domain}:${url}`, hit = cache.get(key);
    if (hit && hit.until > now()) return hit.promise;
    if (cache.size >= 48) cache.delete(cache.keys().next().value);
    const entry = { until: now() + 15 * 60000, promise: load(url, domain) };
    cache.set(key, entry);
    try { return await entry.promise; }
    catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
  }
  return { read };
}
module.exports = { createCalendarSources, allowed, htmlText, hash };
