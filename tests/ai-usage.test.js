const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");
const { createAiUsage, cost, WEEK } = require("../lib/ai-usage");
const { readEvents } = require("../public/chat-stream");
async function fixture(t, dynamo = false, request) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-usage-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "db.json"); db.dynamo = dynamo ? memoryDynamo().store : null;
  for (const id of ["alice", "bob"]) {
    const user = { id, email: `${id}@example.test`, membershipTier: "standard" };
    if (db.dynamo) await db.dynamo.put(`USER#${id}`, "PROFILE", "user", user); else await db.createUser(user);
  }
  let time = Date.parse("2026-11-06T00:00:00Z"), paid = null;
  const create = () => createAiUsage({ db, now: () => time, entitlement: async () => paid, request });
  return { db, service: create(), create, advance: (ms) => time += ms, paid: (value) => paid = value };
}
for (const dynamo of [false, true]) test(`${dynamo ? "DynamoDB" : "local"} atomic weekly reservations, isolation, upgrades, expiration and durable settlement`, async (t) => {
  const f = await fixture(t, dynamo), s = f.service;
  assert.equal((await s.status("alice")).resetsAt, null);
  assert.equal(await f.db.getAiUsage("alice"), null);
  const claims = await Promise.allSettled(Array.from({ length: 4 }, () => s.reserve("alice", 250000)));
  const tickets = claims.filter((result) => result.status === "fulfilled").map((result) => result.value);
  assert.equal(tickets.length, 2);
  assert.equal((await s.status("alice")).remainingUsd, 0);
  assert.equal((await s.status("bob")).remainingUsd, 0.5);
  await s.settle(tickets[0], 100000); await s.settle(tickets[0], 100000);
  assert.equal((await f.create().status("alice")).usedUsd, 0.1);
  const reset = (await s.status("alice")).resetsAt;
  f.paid("2026-12-06T00:00:00Z");
  assert.equal((await s.status("alice")).limitUsd, 2);
  assert.equal((await s.status("alice")).resetsAt, reset);
  f.paid(null);
  assert.equal((await s.status("alice")).usedUsd, 0.1);
  // A completion crossing the reset remains charged to its original period.
  f.advance(WEEK);
  await s.settle(tickets[1], 200000);
  assert.equal((await s.status("alice")).remainingUsd, 0.5);
  const interrupted = await s.reserve("alice", 10000);
  f.advance(11 * 60000);
  assert.equal((await f.create().status("alice")).estimatedUsd, 0.01);
  await s.settle(interrupted, 10000);
  assert.equal((await s.status("alice")).usedUsd, 0.01);
});
test("pricing includes cached input, reasoning totals, long context, searches, containers, images and audio", () => {
  assert.equal(cost("gpt-6.1-sol", { usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 500 }, output_tokens_details: { reasoning_tokens: 100 } } }), 3050);
  assert.equal(cost("gpt-6-luna", { usage: { prompt_tokens: 300000, completion_tokens: 1000 } }), 60750);
  assert.equal(cost("gpt-6.1-sol", { usage: { input_tokens: 0, output_tokens: 0 }, output: [{ type: "web_search_call" }, { type: "code_interpreter_call", container_id: "a" }, { type: "code_interpreter_call", container_id: "a" }] }), 40000);
  assert.equal(cost("gpt-image-2", { usage: { input_tokens_details: { text_tokens: 100, image_tokens: 50 }, output_tokens: 1000 } }), 15450);
  for (const model of ["gpt-image-2.6-sunburst", "gpt-image-2.6-flare"]) {
    assert.equal(cost(model, { usage: { input_tokens_details: { text_tokens: 100, image_tokens: 50 }, output_tokens: 1000 } }), 30900);
  }
  assert.equal(cost("gpt-transcribe", { usage: { seconds: 60 } }), 4500);
});
test("provider admission, actual JSON and trailing stream usage, failed requests and missing usage", async (t) => {
  let kind = "json", calls = 0, body;
  const f = await fixture(t, false, async (url, options) => {
    if (url.endsWith("input_tokens")) return Response.json({ input_tokens: 100 });
    calls++; body = JSON.parse(options.body);
    if (kind === "error") return new Response("Provider error", { status: 400 });
    if (kind === "missing") return Response.json({ output_text: "Answer" });
    if (kind === "stream") {
      const packets = [{ choices: [{ delta: { content: "Answer" } }] }, { choices: [{ finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50 } }];
      return new Response(packets.map((value) => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ output_text: "Answer", usage: { input_tokens: 100, output_tokens: 50 } });
  });
  const s = f.service;
  const send = (model = "gpt-6-luna", stream = false) => s.run("alice", () => s.fetch(`https://api.openai.com/v1/${stream ? "chat/completions" : "responses"}`, { method: "POST", body: JSON.stringify({ model, ...(stream ? { stream, messages: [{ role: "user", content: "Hello" }] } : { input: "Hello" }) }) }));
  await (await send()).json(); assert.equal((await s.status("alice")).usedUsd, 0.000035);
  kind = "stream";
  await readEvents(await send("gpt-6-luna", true), ({ data }) => data === "[DONE]" ? false : undefined);
  assert.equal(body.stream_options.include_usage, true);
  assert.equal((await s.status("alice")).usedUsd, 0.00007);
  kind = "error"; await send(); assert.equal((await s.status("alice")).usedUsd, 0.00007);
  kind = "missing"; await send(); assert.ok((await s.status("alice")).estimatedUsd > 0);
  await assert.rejects(send("unknown-model"), { statusCode: 503 });
  await assert.rejects(s.fetch("https://api.openai.com/v1/responses", { method: "POST", body: '{}' }), { statusCode: 503 });
  const ticket = await s.reserve("alice", Math.round((await s.status("alice")).remainingUsd * 1e6));
  await s.settle(ticket, ticket.amount);
  const before = calls;
  await assert.rejects(send(), { statusCode: 429 }); assert.equal(calls, before);
});
test("usage UI displays reset, balance, estimates and gated upgrade in both languages", () => {
  const ui = require("../public/i18n"), { markup } = require("../public/ai-usage");
  const data = { tier: "standard", remainingUsd: 0, limitUsd: 0.5, resetsAt: "2026-11-13T00:00:00Z" };
  assert.doesNotMatch(markup(data), /data-usage-upgrade/);
  assert.match(markup({ ...data, canUpgrade: true }), /data-usage-upgrade/);
  assert.match(markup({ ...data, estimatedUsd: 0.01 }), /预估/);
  assert.match(markup(data), /2026/);
  ui.setLanguage("en");
  assert.match(markup(data), /Weekly AI allowance/);
  assert.match(markup({ ...data, canUpgrade: true }), /Upgrade to Plus/);
  ui.setLanguage("zh-CN");
});

for (const dynamo of [false, true]) test(`${dynamo ? "DynamoDB" : "local"} allowance polling is read-only until reconciliation is needed`, async (t) => {
  const f = await fixture(t, dynamo), s = f.service;
  const ticket = await s.reserve("alice", 10000);
  const before = structuredClone(await f.db.getAiUsage("alice"));
  const change = f.db.changeAiUsage.bind(f.db);
  let writes = 0;
  f.db.changeAiUsage = (...args) => { writes++; return change(...args); };
  for (let i = 0; i < 20; i++) assert.equal((await s.status("alice")).pendingUsd, 0.01);
  assert.equal(writes, 0, "unchanged polls must not rewrite the database");
  assert.deepEqual(await f.db.getAiUsage("alice"), before);
  f.advance(11 * 60000);
  assert.equal((await s.status("alice")).estimatedUsd, 0.01);
  assert.equal(writes, 1, "expired reservations still reconcile durably");
  await s.status("alice"); assert.equal(writes, 1);
  await s.settle(ticket, 10000);
  assert.equal((await s.status("alice")).usedUsd, 0.01);
  f.advance(WEEK);
  assert.equal((await s.status("alice")).remainingUsd, 0.5);
  const afterReset = writes;
  await s.status("alice"); assert.equal(writes, afterReset);
  assert.equal((await s.status("bob")).resetsAt, null);
});
