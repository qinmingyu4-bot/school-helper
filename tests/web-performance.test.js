const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const http2 = require("node:http2");
const { once } = require("node:events");
const { createStaticAssets } = require("../lib/static-assets");
const root = path.resolve(__dirname, "..");

test("HTTP/2 installer validates ownership, preserves configuration and rolls back failed validation/reload", () => {
  const result = spawnSync("python3", ["-B", "tests/web-performance_test.py"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("real Nginx negotiates HTTP/2 and retains compression, authentication redirects and unbuffered events", { timeout: 20000 }, async (t) => {
  const nginx = process.env.NGINX_BIN || "nginx";
  if (spawnSync(nginx, ["-v"]).error) {
    assert.notEqual(process.env.REQUIRE_NGINX_TEST, "1", "Nginx is required in the Linux validation job");
    return t.skip("Run the Linux performance workflow for actual Nginx/TLS validation");
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-h2-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const assets = createStaticAssets(path.join(root, "public"), { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" });
  await assets.prepare();
  const upstream = http.createServer(async (req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
      res.write("data: first\n\n");
      setTimeout(() => res.end("data: done\n\n"), 500); return;
    }
    if (req.url === "/app") { res.writeHead(302, { location: "/login", "cache-control": "no-store" }); res.end(); return; }
    await assets.send(req, res, "/index.html", new URL(req.url, "http://localhost"));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const cert = path.join(dir, "cert.pem"), key = path.join(dir, "key.pem");
  const openssl = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-keyout", key, "-out", cert], { encoding: "utf8" });
  assert.equal(openssl.status, 0, openssl.stderr);
  // Validate the actual managed domain template, replacing only fixture endpoints
  // and certificate paths. Its streaming/upload/TLS directives stay unchanged.
  const template = await fs.readFile(path.join(root, "aws/domain-https.sh"), "utf8");
  const servers = template.slice(template.indexOf("write_site() {")).match(/server \{\n    listen 443[\s\S]*?\n\}/g);
  const domain = servers.find((server) => server.includes("server_name studybridge.ink;"))
    .replace("listen 443 ssl http2;", `listen 127.0.0.1:${port} ssl http2;`)
    .replace(/ssl_certificate [^;]+;/, `ssl_certificate ${cert};`)
    .replace(/ssl_certificate_key [^;]+;/, `ssl_certificate_key ${key};`)
    .replace("http://127.0.0.1:3000", `http://127.0.0.1:${upstream.address().port}`);
  const config = path.join(dir, "nginx.conf");
  await fs.writeFile(config, `daemon off;\nmaster_process off;\npid ${dir}/nginx.pid;\nerror_log ${dir}/error.log;\nevents {}\nhttp { access_log off; client_body_temp_path ${dir}/body; proxy_temp_path ${dir}/proxy; ${domain} }`);
  const check = spawnSync(nginx, ["-t", "-p", dir, "-c", config], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  const processNginx = spawn(nginx, ["-p", dir, "-c", config], { stdio: "ignore" });
  t.after(async () => { if (processNginx.exitCode === null) { const exit = once(processNginx, "exit"); processNginx.kill(); await exit; } });
  let client;
  for (let attempt = 0; attempt < 30; attempt++) {
    client = http2.connect(`https://127.0.0.1:${port}`, { rejectUnauthorized: false });
    try { await once(client, "connect"); break; } catch { client.destroy(); await new Promise((resolve) => setTimeout(resolve, 50)); }
  }
  t.after(() => client.destroy());
  assert.equal(client.alpnProtocol, "h2");
  async function get(route, headers = {}) {
    const request = client.request({ ":path": route, ...headers }), chunks = [];
    let response, firstByte;
    request.on("response", (value) => { response = value; });
    request.on("data", (chunk) => { firstByte ??= Date.now(); chunks.push(chunk); });
    request.end(); await once(request, "end");
    return { headers: response, body: Buffer.concat(chunks), firstByte, end: Date.now() };
  }
  const results = await Promise.all([get("/login", { "accept-encoding": "br" }), get("/app"), get("/events")]);
  assert.equal(results[0].headers["content-encoding"], "br");
  assert.equal(results[0].headers["cache-control"], "no-store");
  assert.equal(results[1].headers[":status"], 302); assert.equal(results[1].headers.location, "/login");
  assert.equal(results[2].headers["content-encoding"], undefined);
  assert.ok(results[2].end - results[2].firstByte > 250, "first stream event must arrive before the stream ends");
  assert.equal(results[2].body.toString(), "data: first\n\ndata: done\n\n");
});
