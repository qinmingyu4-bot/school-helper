const assert = require("node:assert/strict");
const { test } = require("node:test");
const { create } = require("../public/classmate-notifications");
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness({ streaming = true } = {}) {
  const state = { userId: "alice", enabled: true, hidden: false, visibleChat: null };
  const requests = [], streams = [], timers = new Map(), changes = [], events = [], toasts = [], delays = new Map();
  let now = 0, nextDelay = 0;
  const controller = create({ getUserId: () => state.userId, enabled: () => state.enabled, hidden: () => state.hidden,
    request: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    onChange: (value) => changes.push(value), onEvent: () => events.push("refresh chat"),
    shouldNotify: (message) => message.chatId !== state.visibleChat, onToast: (message) => toasts.push(message),
    delay: (callback, ms) => { const id = ++nextDelay; delays.set(id, { callback, due: now + ms }); return id; },
    cancelDelay: (id) => delays.delete(id),
    openStream: () => {
      if (!streaming) throw new Error("Streaming unavailable");
      const listeners = {};
      const stream = { closed: false, addEventListener: (name, callback) => { listeners[name] = callback; }, close() { this.closed = true; }, emit: (name, data) => listeners[name]?.({ data: JSON.stringify(data) }) };
      streams.push(stream); return stream;
    },
    schedule: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; }, cancel: (id) => timers.delete(id) });
  function tick(ms) {
    now += ms;
    for (const [id, task] of delays) if (task.due <= now) { delays.delete(id); task.callback(); }
  }
  return { state, requests, streams, timers, changes, events, controller, toasts, delays, tick };
}

const incoming = (messageId = "m1", chatId = "chat-bob", senderId = "bob") => ({ type: "message", messageId, chatId, senderId });

test("incoming reminders last exactly ten seconds and dismissal never marks messages read", async () => {
  const h = harness(); h.controller.sync(); h.requests[0].resolve({ hasUnread: true }); await settle();
  h.streams[0].emit("classmates", incoming());
  assert.deepEqual(h.controller.currentToast(), { chatId: "chat-bob", messageId: "m1" });
  h.tick(9999); assert.ok(h.controller.currentToast());
  h.tick(1); assert.equal(h.controller.currentToast(), null); assert.equal(h.controller.hasUnread(), true);
  h.streams[0].emit("classmates", incoming("m2"));
  h.controller.dismissToast(); assert.equal(h.controller.currentToast(), null); assert.equal(h.delays.size, 0);
  assert.equal(h.controller.hasUnread(), true); h.tick(10000); assert.equal(h.toasts.length, 4);
});

test("a newer message replaces the popup and restarts its ten-second timer; retries do not reopen it", () => {
  const h = harness(); h.controller.sync(); h.streams[0].emit("classmates", incoming());
  h.tick(9000); h.streams[0].emit("classmates", incoming("m2"));
  assert.equal(h.delays.size, 1); h.tick(1000); assert.equal(h.controller.currentToast().messageId, "m2");
  h.tick(8999); assert.ok(h.controller.currentToast()); h.tick(1); assert.equal(h.controller.currentToast(), null);
  h.streams[0].emit("classmates", incoming("m2")); assert.equal(h.controller.currentToast(), null);
});

test("only live incoming messages outside the visible conversation raise reminders", () => {
  const h = harness(); h.controller.sync();
  for (const data of [undefined, {}, { chatId: "chat-bob" }, { ...incoming(), messageId: null }, incoming("mine", "chat-bob", "alice")]) h.streams[0].emit("classmates", data);
  h.streams[0].emit("open"); assert.deepEqual(h.toasts, []);
  h.state.visibleChat = "chat-bob"; h.streams[0].emit("classmates", incoming("visible"));
  h.state.visibleChat = null; h.state.hidden = true; h.streams[0].emit("classmates", incoming("background"));
  assert.deepEqual(h.toasts, []);
  h.state.hidden = false; h.streams[0].emit("classmates", incoming("background")); assert.deepEqual(h.toasts, []);
  h.streams[0].emit("classmates", incoming("fresh")); assert.ok(h.controller.currentToast());
  h.state.visibleChat = "chat-bob"; h.controller.reconcileToast(); assert.equal(h.controller.currentToast(), null);
  h.streams[0].emit("classmates", incoming("other", "chat-carol", "carol")); assert.ok(h.controller.currentToast());
  h.state.hidden = true; h.controller.reconcileToast(); assert.equal(h.controller.currentToast(), null);
});

test("logout, account switches and disabled mode cancel reminders and reject late events", () => {
  const h = harness(); h.controller.sync(); h.streams[0].emit("classmates", incoming());
  h.state.userId = "carol"; h.controller.sync(); assert.equal(h.controller.currentToast(), null); assert.equal(h.delays.size, 0);
  h.streams[0].emit("classmates", incoming("late")); assert.equal(h.controller.currentToast(), null);
  h.streams[1].emit("classmates", incoming("new")); assert.ok(h.controller.currentToast());
  h.state.enabled = false; h.controller.sync(); assert.equal(h.controller.currentToast(), null); assert.equal(h.delays.size, 0);
  h.state.enabled = true; h.controller.sync(); h.streams[2].emit("classmates", incoming("last"));
  h.state.userId = null; h.controller.sync(); assert.equal(h.controller.currentToast(), null); assert.equal(h.delays.size, 0);
});

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
