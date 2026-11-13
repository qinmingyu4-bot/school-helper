const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createPreviewServer } = require("../scripts/grade-planner-preview");
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9N8AAAAASUVORK5CYII=";
const upload = { kind: "grades", mime: "image/png", name: "quiz.png", dataUrl: `data:image/png;base64,${png}` };

async function withServer(t, options = {}) {
  const server = createPreviewServer({ useLocalOcr: false, ...options });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, origin = base) => fetch(`${base}/api/preview/grades/recognize`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
  return { base, post };
}
test("isolated preview serves only public preview assets and reports unavailable AI honestly", async (t) => {
  const { base, post } = await withServer(t);
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /grade-planner-preview.js/);
  assert.deepEqual(await (await fetch(`${base}/api/preview/grades/status`)).json(), { configured: false, syllabusConfigured: false, provider: null });
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/api/courses`)).status, 404);
  assert.equal((await post(upload)).status, 503);
});
test("cross-origin requests and forged image contents are rejected before AI", async (t) => {
  let calls = 0;
  const { post } = await withServer(t, { recognize: async () => { calls++; return '{"rows":[]}'; } });
  assert.equal((await post(upload, "https://example.com")).status, 403);
  assert.equal((await post({ ...upload, dataUrl: "data:image/png;base64,aGVsbG8=" })).status, 400);
  assert.equal(calls, 0);
});
test("recognition returns editable evidence only; it never saves grades", async (t) => {
  const { post } = await withServer(t, { recognize: async () => JSON.stringify({ rows: [{ name: "Quiz 3", categoryName: "Quiz", score: 0, max: 10, evidence: "Quiz 3: 0 / 10" }] }) });
  const response = await post(upload);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { rows: [{ name: "Quiz 3", categoryName: "Quiz", score: 0, max: 10, evidence: "Quiz 3: 0 / 10" }] });
});

test("configured AI transport sends the original image with storage disabled", async (t) => {
  let calls = 0;
  const { post } = await withServer(t, {
    config: { OPENAI_API_KEY: "test-placeholder-not-real", GRADE_PREVIEW_MODEL: "test-model" },
    request: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "test-model");
      assert.equal(body.store, false);
      assert.equal(body.input[0].content[1].image_url, upload.dataUrl);
      return { ok: true, json: async () => ({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"rows":[{"name":"Quiz 3","score":9,"max":10,"evidence":"9 / 10"}]}' }] }] }) };
    }
  });
  const response = await post(upload);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rows[0].score, 9);
  assert.equal(calls, 1);
});
