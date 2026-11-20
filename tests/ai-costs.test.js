const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");
const { createAiCosts } = require("../lib/ai-costs");
const { createAiUsage, cost } = require("../lib/ai-usage");
const date = "2026-11-20";
const payload = { usage: { input_tokens: 12000, output_tokens: 100, input_tokens_details: {
  cached_tokens: 4000, cache_write_tokens: 7000, cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 }
} }, output: [{ type: "web_search_call" }] };
const url = "https://api.openai.com/v1/responses";
const options = { method: "POST", body: JSON.stringify({ model: "gpt-6.1-sol", input: "PRIVATE_PROMPT" }) };
async function fixture(t, dynamo = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-costs-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(dir, "db.json");
  db.dynamo = dynamo ? memoryDynamo().store : null;
  return db;
}

test("cache writes use separate lifetimes, avoid double counting and include tools", () => {
  assert.equal(cost("gpt-6.1-sol", payload), 40900);
  assert.equal(cost("gpt-6-luna", { usage: { prompt_tokens: 1000, completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 100, cache_write_tokens: 500 } } }), 104);
  assert.equal(cost("gpt-6.1-sol", { usage: { input_tokens: 1000, output_tokens: 0,
    input_tokens_details: { cache_write_tokens: 1000 } } }, { cacheTtl: "12h" }), 5000);
  assert.equal(cost("gpt-6.1-sol", { usage: { input_tokens: 300000, output_tokens: 100,
    input_tokens_details: { cache_write_tokens: 300000 } } }), 1501500);
  assert.equal(cost("gpt-6.1-sol", { ...payload, service_tier: "flex" }), null);
  assert.equal(cost("gpt-6.1-sol", { usage: { input_tokens: 1, output_tokens: 0, input_tokens_details: { cached_tokens: 2 } } }), null);
});

for (const dynamo of [false, true]) test(`${dynamo ? 'DynamoDB' : 'local'} ledger captures platform and user calls, survives restart, excludes content`, async (t) => {
  const db = await fixture(t, dynamo);
  let time = Date.parse(date + "T23:59:59Z"), mode = "normal";
  const service = createAiCosts({ db, now: () => time, env: {}, request: async () => {
    assert.ok((await db.listAiCosts([date])).some((r) => r.status === "pending"));
    if (mode === "network") throw new Error("network");
    if (mode === "rejected") return new Response("failure", { status: 429 });
    return Response.json(payload, { headers: { "x-request-id": "req_fixture" } });
  } });
  await service.fetch(url, options, { payer: "platform", source: "academic-calendar" });
  await service.fetch(url, options, { userId: "alice", source: "study" });
  mode = "network";
  await assert.rejects(service.fetch(url, options, { payer: "platform", source: "academic-calendar" }));
  mode = "rejected"; await service.fetch(url, options, { userId: "alice" });
  let report = await service.report(date, date);
  assert.equal(report.calculatedUsd, 0.0818);
  assert.equal(report.platformUsd, 0.0409); assert.equal(report.userUsd, 0.0409);
  assert.equal(report.unknownRequests, 1); assert.equal(report.requests, 4);
  assert.equal(report.official.status, "not_configured");
  assert.equal((await service.report(date, date, "alice")).requests, 2);
  assert.doesNotMatch(JSON.stringify(await db.listAiCosts([date])), /PRIVATE_PROMPT|authorization|input_tokens_details/);
  await db.putAiCost({ id: "crashed", startedAt: new Date(time).toISOString(), status: "pending", amountMicros: null, payer: "platform", source: "health-check", model: "gpt-6-luna" });
  time += 11 * 60000;
  report = await createAiCosts({ db, now: () => time, env: {} }).report(date, date);
  assert.equal(report.unknownRequests, 2); assert.equal(report.calculatedUsd, 0.0818);
});

test("streaming observes trailing usage across chunk boundaries once; cancellation stays unknown", async (t) => {
  const db = await fixture(t);
  const time = Date.parse(date);
  const text = `data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: ${JSON.stringify(payload)}`;
  const service = createAiCosts({ db, now: () => time, env: {}, request: async () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(text.slice(0, 30))); c.enqueue(new TextEncoder().encode(text.slice(30))); c.close(); }
  })) });
  const response = await service.fetch(url, { ...options, body: JSON.stringify({ model: "gpt-6.1-sol", stream: true }) });
  assert.equal(await response.text(), text);
  assert.equal((await service.report(date, date)).calculatedUsd, 0.0409);
  const canceled = await service.fetch(url, { ...options, body: JSON.stringify({ model: "gpt-6.1-sol", stream: true }) });
  await canceled.body.cancel();
  const report = await service.report(date, date);
  assert.equal(report.requests, 2); assert.equal(report.unknownRequests, 1);
});

test("account calls outside feature analytics are recorded without double counting or spending platform quota", async (t) => {
  const db = await fixture(t);
  await db.createUser({ id: "alice", membershipTier: "plus", email: "a@example.test" });
  const costs = createAiCosts({ db, env: {}, now: () => Date.parse(date), request: async (url) =>
    url.endsWith("input_tokens") ? Response.json({ input_tokens: 100 }) : Response.json(payload) });
  const usage = createAiUsage({ db, request: (u, o, meta) => costs.fetch(u, o, { ...meta, userId: "alice" }) });
  await usage.run("alice", () => usage.fetch(url, options));
  await costs.fetch(url, options, { payer: "platform", source: "product-help" });
  assert.equal((await usage.status("alice")).usedUsd, 0.0409);
  assert.equal((await costs.report(date, date)).requests, 2);
});

test("persist-before-dispatch fails closed; failed settlement remains durably unresolved", async (t) => {
  const db = await fixture(t); let dispatched = 0;
  const save = db.putAiCost.bind(db);
  db.putAiCost = async () => { throw Error("disk unavailable"); };
  const service = createAiCosts({ db, env: {}, now: () => Date.parse(date), request: async () => { dispatched++; return Response.json(payload); } });
  await assert.rejects(service.fetch(url, options)); assert.equal(dispatched, 0);
  db.putAiCost = async (row) => row.status === "pending" ? save(row) : Promise.reject(Error("disk unavailable"));
  await service.fetch(url, options);
  const report = await service.report(date, date);
  assert.equal(report.storageFailures, 1); assert.equal(report.pendingRequests, 1); assert.equal(report.calculatedUsd, 0);
});

test("official reconciliation is project-scoped, paginated, cached and never added to local amounts", async (t) => {
  const db = await fixture(t); let calls = 0;
  const env = { OPENAI_COSTS_ADMIN_KEY: "secret-test", OPENAI_COSTS_PROJECT_ID: "proj_test", OPENAI_COSTS_API_KEY_ID: "key_test" };
  const service = createAiCosts({ db, env, now: () => Date.parse(date), request: async (u, o) => {
    calls++;
    const parsed = new URL(u);
    assert.equal(parsed.origin, "https://api.openai.com"); assert.equal(parsed.searchParams.get("project_ids"), "proj_test");
    assert.equal(parsed.searchParams.get("api_key_ids"), "key_test"); assert.equal(o.headers.authorization, "Bearer secret-test");
    return Response.json({ data: [{ start_time: Date.parse(date) / 1000, results: [{ amount: { currency: "usd", value: 1.25 }, line_item: "search" }] }],
      has_more: calls === 1, next_page: calls === 1 ? "next" : null });
  } });
  const r = await service.report(date, date); assert.equal(r.official.amountUsd, 2.5); assert.equal(r.calculatedUsd, 0);
  await service.report(date, date); assert.equal(calls, 2); assert.doesNotMatch(JSON.stringify(r), /secret-test/);
  const unavailable = createAiCosts({ db, env, request: async () => new Response("forbidden", { status: 403 }) });
  assert.equal((await unavailable.report(date, date)).official.status, "unavailable");
});

test("cost periods are inclusive UTC days and all covers collection start", () => {
  const { costWindow } = require("../lib/ai-costs");
  const since = "2024-02-29T13:00:00.000Z", time = Date.parse("2026-11-20T23:59:59Z");
  for (const period of ["7", "30", "90", "180", "365"]) {
    const range = costWindow(period, since, time);
    assert.equal((Date.parse(range.through) - Date.parse(range.from)) / 86400000 + 1, Number(period));
    assert.equal(range.through, "2026-11-20");
  }
  assert.equal(costWindow("all", since, time).from, "2024-02-29");
  assert.throws(() => costWindow("0", since, time), { statusCode: 400 });
});

for (const dynamo of [false, true]) test(`${dynamo ? 'DynamoDB' : 'local'} retains costs beyond one year for all-time totals`, async (t) => {
  const db = await fixture(t, dynamo), since = "2024-02-29T12:00:00Z";
  await db.aiCostSince(since);
  const writes = [];
  if (dynamo) {
    const original = db.dynamo.transactPut.bind(db.dynamo);
    db.dynamo.transactPut = async (rows) => { writes.push(...rows); return original(rows); };
  }
  const make = (id, startedAt, payer, amountMicros) => ({ id, startedAt, payer, amountMicros, status: "calculated", source: "study", model: "gpt-6-luna" });
  await db.putAiCost(make("old", since, "user", 100001));
  await db.putAiCost(make("new", "2026-11-20T12:00:00Z", "platform", 200002));
  const service = createAiCosts({ db, env: {}, now: () => Date.parse("2026-11-20T15:00:00Z") });
  const all = await service.periodReport("all"), year = await service.periodReport("365");
  assert.equal(all.aiCosts.calculatedUsd, 0.300003);
  assert.equal(all.aiCosts.userUsd, 0.100001); assert.equal(all.aiCosts.platformUsd, 0.200002);
  assert.equal(year.aiCosts.calculatedUsd, 0.200002);
  assert.equal(all.from, "2024-02-29");
  assert.ok(writes.every((r) => r.expiresAt === undefined), "Cost records must not expire with activity records");
});
