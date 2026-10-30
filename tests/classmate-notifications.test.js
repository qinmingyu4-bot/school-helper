const assert = require("node:assert/strict");
const { test } = require("node:test");
const { create } = require("../public/classmate-notifications");
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness({ streaming = true } = {}) {
  const state = { userId: "alice", enabled: true, hidden: false };
  const requests = [], streams = [], timers = new Map(), changes = [], events = [];
  const controller = create({ getUserId: () => state.userId, enabled: () => state.enabled, hidden: () => state.hidden,
    request: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    onChange: (value) => changes.push(value), onEvent: () => events.push("refresh chat"),
    openStream: () => {
      if (!streaming) throw new Error("Streaming unavailable");
      const listeners = {};
      const stream = { closed: false, addEventListener: (name, callback) => { listeners[name] = callback; }, close() { this.closed = true; }, emit: (name) => listeners[name]?.() };
      streams.push(stream); return stream;
    },
    schedule: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; }, cancel: (id) => timers.delete(id) });
  return { state, requests, streams, timers, changes, events, controller };
}

test("one account keeps a single live subscription across page renders and updates only the indicator", async () => {
  const h = harness(); h.controller.sync(); h.controller.sync();
  assert.equal(h.streams.length, 1); assert.equal(h.timers.size, 1);
  h.requests[0].resolve({ hasUnread: false }); await settle();
  h.streams[0].emit("classmates");
  h.requests[1].resolve({ hasUnread: true }); await settle();
  assert.equal(h.controller.hasUnread(), true); assert.deepEqual(h.changes, [true]);
  h.controller.sync(); assert.equal(h.streams.length, 1);
  const refreshed = h.controller.refresh();
  h.requests[2].resolve({ hasUnread: true }); await refreshed;
});

test("an event supersedes a stale summary and read acknowledgement clears the dot", async () => {
  const h = harness(); h.controller.sync();
  h.streams[0].emit("classmates");
  h.requests[0].resolve({ hasUnread: false }); await settle();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ hasUnread: true }); await settle();
  assert.equal(h.controller.hasUnread(), true);
  const read = h.controller.refresh(); h.requests[2].resolve({ hasUnread: false }); await read;
  assert.equal(h.controller.hasUnread(), false); assert.deepEqual(h.changes, [true, false]);
});

test("account switches reject old requests/events and preserve a newer in-flight request", async () => {
  const h = harness(); h.controller.sync();
  h.state.userId = "bob"; assert.equal(h.controller.hasUnread(), false); h.controller.sync();
  assert.equal(h.streams[0].closed, true); assert.equal(h.streams.length, 2);
  h.requests[0].resolve({ hasUnread: true }); await settle();
  h.streams[0].emit("classmates"); assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ hasUnread: false }); await settle();
  assert.deepEqual(h.changes, []); assert.equal(h.controller.hasUnread(), false);
  h.streams[1].emit("classmates"); h.requests[2].resolve({ hasUnread: true }); await settle();
  assert.equal(h.controller.hasUnread(), true);
  h.state.enabled = false; h.controller.sync(); assert.equal(h.controller.hasUnread(), false); assert.equal(h.timers.size, 0);
});

test("polling reconciles missed events without fetching while the document is hidden", async () => {
  const h = harness({ streaming: false }); h.controller.sync();
  h.requests[0].resolve({ hasUnread: false }); await settle();
  h.state.hidden = true; [...h.timers.values()][0](); assert.equal(h.requests.length, 1);
  h.state.hidden = false; const resumed = h.controller.refresh();
  h.requests[1].resolve({ hasUnread: true }); await resumed;
  assert.equal(h.controller.hasUnread(), true);
  [...h.timers.values()][0](); h.requests[2].resolve({ hasUnread: false }); await settle();
  assert.equal(h.controller.hasUnread(), false);
});

test("transient errors retain unread state; expired sessions stop and clear the subscription", async () => {
  const h = harness(); h.controller.sync(); h.requests[0].resolve({ hasUnread: true }); await settle();
  const failed = h.controller.refresh(); h.requests[1].reject(new Error("Offline")); await failed;
  assert.equal(h.controller.hasUnread(), true);
  const malformed = h.controller.refresh(); h.requests[2].resolve({}); await malformed;
  assert.equal(h.controller.hasUnread(), true, "a malformed response is not evidence that messages were read");
  const expired = h.controller.refresh(); h.requests[3].reject(Object.assign(new Error("Expired"), { status: 401 })); await expired;
  assert.equal(h.controller.hasUnread(), false); assert.equal(h.streams[0].closed, true); assert.equal(h.timers.size, 0);
  h.controller.sync(); assert.equal(h.streams.length, 1, "an expired session must not reopen on every render");
});

test("pagehide/restore stops old work and starts a fresh subscription", async () => {
  const h = harness(); h.controller.sync(); h.controller.stop(); h.controller.sync();
  h.requests[0].resolve({ hasUnread: true }); await settle(); assert.equal(h.controller.hasUnread(), false);
  h.requests[1].resolve({ hasUnread: true }); await settle(); assert.equal(h.controller.hasUnread(), true);
  h.state.userId = null; h.controller.sync(); assert.equal(h.controller.hasUnread(), false); assert.equal(h.timers.size, 0);
});
