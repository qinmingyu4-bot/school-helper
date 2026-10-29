const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const helpers = source.slice(source.indexOf("  function classmateMutationKey("), source.indexOf("  async function readFiles("));
const actions = source.slice(source.indexOf('      if (action === "add-classmate")'), source.indexOf('      if (action === "draft-email")'));

function harness(action = "send-dm") {
  const state = { user: { id: "alice" }, page: "classmates", activeClassmateId: "chat", classmateChatOpen: true, directMessageDrafts: { chat: "Hello" } };
  const button = { dataset: { action, id: "request" }, disabled: false };
  const buttons = [button];
  const input = { value: "Hello", focus() {} }, sbInput = { value: "PeerID" };
  const requests = [], loads = [], notices = [];
  let generation = 1;
  const context = vm.createContext({ state, JSON,
    $: (id) => id === "dmInput" ? input : id === "classmateSbId" ? sbInput : null,
    root: { querySelector: (selector) => selector === ".chat-panel" && state.classmateChatOpen ? { dataset: { chatId: state.activeClassmateId } } : null,
      querySelectorAll: () => buttons },
    api: (path, options) => new Promise((resolve, reject) => requests.push({ path, options, resolve, reject })),
    loadPage: async (page) => { state.page = page; loads.push(page); generation++; },
    setToast: (text) => notices.push(text), render() {},
    get pageLoadGeneration() { return generation; }
  });
  vm.runInContext(`const classmateMutations = new Set(); let classmateListDraft = "PeerID"; ${helpers}
    async function run(button) { const action = button.dataset.action; ${actions} }`, context);
  return { state, button, buttons, input, sbInput, requests, loads, notices, context, run: (target = button) => context.run(target),
    navigate: (page = "study") => { state.page = page; generation++; } };
}

test("classmate sends retain text typed during delivery, including surrounding spaces", async () => {
  const h = harness();
  h.input.value = " Hello ";
  const sent = h.run();
  assert.equal(h.requests[0].options.body.content, "Hello");
  h.input.value = "My next message";
  h.state.directMessageDrafts.chat = "My next message";
  h.requests[0].resolve({}); await sent;
  assert.equal(h.input.value, "My next message");
  assert.equal(h.state.directMessageDrafts.chat, "My next message");
  assert.equal(h.button.disabled, false);
});

test("successful classmate delivery clears only the submitted draft", async () => {
  const h = harness(); const sent = h.run();
  h.requests[0].resolve({}); await sent;
  assert.equal(h.input.value, "");
  assert.equal(h.state.directMessageDrafts.chat, "");
  assert.deepEqual(h.loads, ["classmates"]);
});

test("delivery and request decisions never navigate back after the user leaves", async () => {
  for (const action of ["send-dm", "add-classmate", "friend-accept", "friend-ignore"]) {
    const h = harness(action); const sent = h.run(); h.navigate();
    h.requests[0].resolve({ status: "pending" }); await sent;
    assert.equal(h.state.page, "study");
    assert.deepEqual(h.loads, []);
    assert.deepEqual(h.notices, []);
  }
});

test("obsolete errors and successes cannot affect a different account", async () => {
  for (const fail of [false, true]) {
    const h = harness(); const sent = h.run();
    h.state.user = { id: "bob" }; h.input.value = "Bob's draft"; h.state.directMessageDrafts.chat = "Bob's draft";
    if (fail) h.requests[0].reject(new Error("Alice delivery failed")); else h.requests[0].resolve({});
    await sent;
    assert.deepEqual(h.loads, []); assert.deepEqual(h.notices, []);
    assert.equal(h.input.value, "Bob's draft");
    assert.equal(h.state.directMessageDrafts.chat, "Bob's draft");
  }
});

test("rerendered send buttons and conflicting request actions share a pending guard", async () => {
  for (const action of ["send-dm", "add-classmate", "friend-accept"]) {
    const h = harness(action); const first = h.run();
    const replacement = { dataset: { ...h.button.dataset, action: action === "friend-accept" ? "friend-ignore" : action }, disabled: false };
    h.buttons.push(replacement);
    h.context.updateClassmateMutationButtons();
    assert.equal(replacement.disabled, true);
    await h.run(replacement);
    assert.equal(h.requests.length, 1);
    h.requests[0].reject(new Error("Try again")); await first;
    assert.equal(replacement.disabled, false);
    assert.equal(h.input.value, "Hello");
    assert.equal(h.sbInput.value, "PeerID");
    assert.equal(h.notices[0], "Try again");
  }
});

test("old chat delivery cannot clear a different open conversation", async () => {
  const h = harness(); const sent = h.run();
  h.state.activeClassmateId = "other-chat";
  h.input.value = "Other conversation draft";
  h.requests[0].resolve({}); await sent;
  assert.equal(h.input.value, "Other conversation draft");
  assert.equal(h.state.directMessageDrafts.chat, "");
  assert.deepEqual(h.loads, []);
});

test("obsolete live responses stop before fetching another account's chat or closing its stream", async () => {
  const live = source.slice(source.indexOf("  async function syncClassmatesLive("), source.indexOf("  function updateClassmatesLiveView("));
  for (const fail of [false, true]) {
    const state = { user: { id: "alice" }, page: "classmates", activeClassmateId: "chat", classmateChatOpen: true };
    const requests = [], updates = [];
    const context = vm.createContext({ state, document: { hidden: false }, requestAnimationFrame() {},
      api: (path) => new Promise((resolve, reject) => requests.push({ path, resolve, reject })),
      updateClassmatesLiveView: () => updates.push("render"), stopClassmatesLive: () => updates.push("stop") });
    vm.runInContext(`let classmatesSyncing = false, classmatesSyncQueued = false, classmatesGeneration = 1; ${live}`, context);
    const sync = context.syncClassmatesLive();
    state.user = { id: "bob" };
    if (fail) requests[0].reject(Object.assign(new Error("Old session expired"), { status: 401 }));
    else requests[0].resolve({ classmates: [{ id: "chat", peer: { name: "Alice's friend" } }] });
    await sync;
    assert.equal(requests.length, 1);
    assert.equal(state.classmates, undefined);
    assert.deepEqual(updates, []);
  }
});

test("late read acknowledgements cannot alter a newly signed-in account's unread count", async () => {
  const acknowledge = source.slice(source.indexOf("  async function acknowledgeClassmateRead("), source.indexOf("  function classmateMutationKey("));
  const state = { user: { id: "alice" }, page: "classmates", activeClassmateId: "chat", classmateChatOpen: true,
    directMessageReadIds: ["message"], classmates: { classmates: [{ id: "chat", unreadCount: 5 }] } };
  let complete; const updates = [];
  const context = vm.createContext({ state, document: { hidden: false },
    root: { querySelector: () => ({ dataset: { chatId: "chat" } }) },
    api: () => new Promise((resolve) => { complete = resolve; }), updateClassmatesLiveView: () => updates.push("render") });
  vm.runInContext(`const classmateReadPending = new Set(); ${acknowledge}`, context);
  const read = context.acknowledgeClassmateRead();
  state.user = { id: "bob" }; complete({ unreadCount: 0 }); await read;
  assert.equal(state.classmates.classmates[0].unreadCount, 5);
  assert.deepEqual(state.directMessageReadIds, ["message"]);
  assert.deepEqual(updates, []);
});
