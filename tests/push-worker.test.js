const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");

const notification = { title: "StudyBridge schedule reminder", body: "A schedule item is starting or due soon. Tap to view.", userId: "alice", url: "/app?page=schedule&scheduleItem=event" };

async function fixture(request, existing = false) {
  const source = await fs.readFile(path.join(__dirname, "../public/push-worker.js"), "utf8");
  const handlers = {}, shown = [], opened = [], messages = [], requests = [];
  let focused = 0, closed = 0;
  const client = { url: "https://study.example/app?page=study", postMessage: (value) => messages.push(value), focus: async () => { focused++; } };
  const self = {
    location: { origin: "https://study.example" }, addEventListener: (name, handler) => { handlers[name] = handler; },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    clients: { matchAll: async () => existing ? [client] : [], openWindow: async (url) => { opened.push(url); } }
  };
  vm.runInNewContext(source, { self, URL, AbortSignal, fetch: async (url, options) => { requests.push({ url, options }); return request(url, options); } });
  async function dispatch(name, event) {
    let work;
    handlers[name]({ ...event, waitUntil: (promise) => { work = promise; } });
    await work;
  }
  return {
    shown, opened, messages, requests, focused: () => focused, closed: () => closed,
    push: (value = notification) => dispatch("push", { data: { json: () => value } }),
    click: (data = notification) => dispatch("notificationclick", { notification: { close() { closed++; }, data } })
  };
}

test("valid pushes display immediately without depending on the account API", async (context) => {
  const failures = {
    "server unavailable": async () => ({ ok: false, status: 503 }),
    "network disconnected": async () => { throw new TypeError("Failed to fetch"); },
    "request stalled": async () => new Promise(() => {})
  };
  for (const [name, request] of Object.entries(failures)) await context.test(name, { timeout: 1000 }, async () => {
    const worker = await fixture(request);
    await worker.push();
    assert.equal(worker.shown.length, 1);
    assert.equal(worker.shown[0].title, notification.title);
    assert.equal(worker.shown[0].options.body, notification.body);
    assert.equal(worker.requests.length, 0);
  });
});

test("notification clicks authenticate the owner before opening an item or messaging an existing app", async () => {
  for (const existing of [false, true]) {
    const worker = await fixture(async () => ({ ok: true, json: async () => ({ user: { id: "alice" } }) }), existing);
    await worker.click();
    assert.equal(worker.closed(), 1);
    assert.equal(worker.requests.length, 1);
    assert.equal(worker.requests[0].url, "/api/me");
    assert.equal(worker.requests[0].options.credentials, "same-origin");
    assert.equal(worker.requests[0].options.cache, "no-store");
    assert.ok(worker.requests[0].options.signal instanceof AbortSignal);
    if (existing) {
      assert.equal(worker.opened.length, 0);
      assert.equal(worker.focused(), 1);
      assert.equal(worker.messages[0].type, "studybridge-schedule-push");
      assert.equal(worker.messages[0].userId, "alice");
      assert.equal(worker.messages[0].url, `https://study.example${notification.url}`);
    } else assert.deepEqual(worker.opened, [`https://study.example${notification.url}`]);
  }
});

test("signed-out, switched-account and unavailable-account clicks never open the original item", async (context) => {
  const responses = {
    "signed out": async () => ({ ok: false, status: 401 }),
    "different account": async () => ({ ok: true, json: async () => ({ user: { id: "bob" } }) }),
    "server unavailable": async () => ({ ok: false, status: 503 }),
    "network disconnected": async () => { throw new TypeError("Failed to fetch"); },
    "invalid response": async () => ({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } })
  };
  for (const [name, request] of Object.entries(responses)) await context.test(name, async () => {
    for (const existing of [false, true]) {
      const worker = await fixture(request, existing);
      await worker.push(); assert.equal(worker.shown.length, 1);
      await worker.click();
      assert.equal(worker.messages.length, 0);
      assert.equal(worker.focused(), existing ? 1 : 0);
      assert.deepEqual(worker.opened, existing ? [] : ["https://study.example/app"]);
    }
  });
});

test("push notifications continue to restrict navigation to the same-origin app", async () => {
  const worker = await fixture(async () => ({ ok: true, json: async () => ({ user: { id: "alice" } }) }));
  await worker.push({ ...notification, url: "https://evil.test/phishing" });
  assert.equal(worker.shown[0].options.data.url, "/app?page=schedule");
  await worker.click({ ...notification, url: "https://evil.test/phishing" });
  await worker.click({ ...notification, url: "/admin" });
  assert.equal(worker.requests.length, 0);
  assert.equal(worker.opened.length, 0);
});
