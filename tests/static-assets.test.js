const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { createStaticAssets, encodingFor } = require("../lib/static-assets");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };

async function serve(t, directory) {
  const assets = createStaticAssets(directory, mime);
  await assets.prepare();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    assets.send(req, res, url.pathname, url).catch(() => { res.writeHead(404); res.end(); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (url, headers = {}, method = "GET") => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: url, headers, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject); req.end();
  });
}

test("release entries preserve script order, CSS cascade and fonts with two immutable bundles", async (t) => {
  const get = await serve(t, path.resolve(__dirname, "../public"));
  for (const entry of ["index", "landing"]) {
    const html = await get(`/${entry}.html`, { "accept-encoding": "br, gzip" });
    assert.equal(html.headers["cache-control"], "no-store");
    const text = zlib.brotliDecompressSync(html.body).toString();
    const scripts = [...text.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)];
    const styles = [...text.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)];
    assert.equal(scripts.length, 1); assert.match(scripts[0][0], / defer/); assert.equal(styles.length, 1);
    const js = await get(scripts[0][1]);
    assert.match(js.headers["cache-control"], /immutable/);
    new vm.Script(js.body.toString()); // Concatenated UMD/IIFEs must remain valid JavaScript.
    const original = await fs.readFile(path.resolve(__dirname, `../public/${entry}.html`), "utf8");
    let previous = -1;
    for (const script of original.matchAll(/<script[^>]+src="([^"?]+)[^"]*"/g)) {
      const offset = js.body.indexOf(`/* ${script[1]} */`);
      assert.ok(offset > previous, `${script[1]} dependency order`); previous = offset;
    }
    const css = (await get(styles[0][1])).body.toString();
    if (entry === "index") {
      assert.ok(css.indexOf("--ink: #071b3a") < css.indexOf(".admin-"));
      assert.match(css, /url\("\/vendor\/katex-0\.18\.2\/fonts\/KaTeX_Main-Regular\.woff2"\)/);
    }
    for (const match of css.matchAll(/url\(["']?(\/[^)"']+)/g)) assert.equal((await get(match[1])).status, 200, match[1]);
    for (const encoding of ["gzip", "br"]) {
      const zipped = await get(scripts[0][1], { "accept-encoding": encoding });
      const decoded = encoding === "br" ? zlib.brotliDecompressSync(zipped.body) : zlib.gunzipSync(zipped.body);
      assert.deepEqual(decoded, js.body);
      assert.ok(zipped.body.length < js.body.length * 0.4);
      assert.equal(zipped.headers.vary, "Accept-Encoding");
      const head = await get(scripts[0][1], { "accept-encoding": encoding }, "HEAD");
      assert.equal(head.body.length, 0); assert.equal(Number(head.headers["content-length"]), zipped.body.length);
    }
    const unchanged = await get(scripts[0][1], { "if-none-match": js.headers.etag });
    assert.equal(unchanged.status, 304); assert.equal(unchanged.body.length, 0);
  }
  const plain = await get("/app.js?v=old");
  assert.match(plain.headers["cache-control"], /must-revalidate/);
  assert.equal((await get("/app.js?v=old", { "if-none-match": plain.headers.etag })).status, 304);
  assert.equal((await get("/push-worker.js")).headers["cache-control"], "no-store");
  assert.equal((await get("/index.html", { "if-none-match": "*" })).status, 200);
  assert.equal((await get("/app.js", { "accept-encoding": "*;q=0" })).status, 406);
  assert.equal((await get("/app.js", {}, "POST")).status, 405);
  assert.equal((await get("/assets/stale.js")).status, 404);
});

test("content changes invalidate entry URLs without a package-version bump; old query strings cannot become immutable", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-assets-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const html = '<link rel="stylesheet" href="/theme.css?v=old"><script src="/code.js?v=old"></script><img src="/icon.svg">';
  await Promise.all([fs.writeFile(path.join(dir, "index.html"), html), fs.writeFile(path.join(dir, "landing.html"), html),
    fs.writeFile(path.join(dir, "code.js"), 'var release = 1;'), fs.writeFile(path.join(dir, "theme.css"), 'body { color: red; }'),
    fs.writeFile(path.join(dir, "icon.svg"), '<svg/>')]);
  const first = await serve(t, dir), before = (await first("/index.html")).body.toString();
  const icon = before.match(/src="(\/icon[^\"]+)"/)[1];
  assert.match((await first(icon)).headers["cache-control"], /immutable/);
  await Promise.all([fs.writeFile(path.join(dir, "code.js"), 'var release = 2;'), fs.writeFile(path.join(dir, "theme.css"), 'body { color: blue; }'), fs.writeFile(path.join(dir, "icon.svg"), '<svg>new</svg>')]);
  const second = await serve(t, dir), after = (await second("/index.html")).body.toString();
  assert.notEqual(before.match(/\/assets\/[^\"]+\.js/)[0], after.match(/\/assets\/[^\"]+\.js/)[0]);
  assert.notEqual(before.match(/\/assets\/[^\"]+\.css/)[0], after.match(/\/assets\/[^\"]+\.css/)[0]);
  assert.match((await second(icon)).headers["cache-control"], /must-revalidate/);
});

test("compression negotiation respects exclusions, quality preferences and identity", () => {
  assert.equal(encodingFor("br;q=0, gzip", true), "gzip");
  assert.equal(encodingFor("gzip;q=0.5, br;q=0.8, identity;q=0.1", true), "br");
  assert.equal(encodingFor("", true), "identity");
  assert.equal(encodingFor("gzip;q=0, br;q=0", true), "identity");
  assert.equal(encodingFor("*;q=0, gzip", true), "gzip");
  assert.equal(encodingFor("identity;q=0, gzip", false), undefined);
});

test("boot requests start concurrently and retain authenticated navigation and logged-out recovery", async () => {
  const source = await fs.readFile(path.resolve(__dirname, "../public/app.js"), "utf8");
  const boot = source.slice(source.indexOf("  async function boot()"), source.indexOf('\n  document.addEventListener("click"', source.indexOf("  async function boot()")));
  for (const signedIn of [true, false]) {
    const pending = new Map(), state = {}, pages = [], rendered = [];
    const context = { URL, location: { href: "https://example.test/app?page=schedule", search: "?page=schedule" },
      api: (url) => new Promise((resolve, reject) => pending.set(url, { resolve, reject })), state,
      document: {}, history: { replaceState() {} }, root: {}, ui: { text: (x) => x }, render: () => rendered.push(true),
      reportUserActivity() {}, localStorage: { getItem: () => null }, isAdmin: () => false, loadPage: async (page) => pages.push(page) };
    vm.createContext(context);
    const result = vm.runInContext(boot + "\nboot();", context);
    assert.deepEqual([...pending.keys()].sort(), ["/api/auth/config", "/api/auth/google/config", "/api/me"]);
    pending.get("/api/me").resolve(signedIn ? { user: { id: "fixture" } } : null);
    pending.get("/api/auth/google/config").resolve({ enabled: true });
    pending.get("/api/auth/config")[signedIn ? "resolve" : "reject"](signedIn ? {} : new Error("offline"));
    await result;
    if (signedIn) { assert.equal(state.user.id, "fixture"); assert.deepEqual(pages, ["schedule"]); }
    else { assert.equal(rendered.length, 1); assert.match(state.toast, /注册配置/); }
  }
});
