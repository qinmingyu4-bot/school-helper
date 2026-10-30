const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const loaders = source.slice(source.indexOf("  async function refreshCourseConversations("), source.indexOf("  function stopClassmatesLive()"));

function harness(defer = []) {
  const requests = [], notices = [], renders = [];
  const state = { user: { id: "alice", name: "Alice" }, mode: "student", page: "profile", tool: "docs",
    courses: [{ id: "kept", name: "Saved course" }], activeCourseId: "general", activeConversationId: "default",
    conversationCourseId: "general", courseConversations: {}, expandedCourses: {}, scheduleItems: [],
    communityChannel: "all", communityChoices: {}, activeClassmateId: "", classmateChatOpen: false };
  let formDraft = "";
  const context = vm.createContext({ ui: require("../public/i18n"),
    state, URLSearchParams,
    setPage(page) {
      if (page === "tools" && state.tool === "email") { page = "email"; state.tool = "docs"; }
      state.page = state.mode === "admin" ? "admin" : ["study", "schedule", "tools", "email", "profile", "community", "classmates"].includes(page) ? page : "study";
    },
    render() { renders.push(state.page); formDraft = ""; },
    setToast: (message) => notices.push(message), syncClassmatesLive: () => {},
    communityQuery: () => "channel=all", communityValue: () => "",
    officeTools: { supports: () => true }, creativeTools: { load: async () => {} }, creativeContext: () => ({}),
    mailboxView: { load: async () => { requests.push({ path: "/api/mailbox" }); } },
    localStorage: { getItem: () => null }, isGeneralChat: () => state.activeCourseId === "general",
    chatSpaces: { general: { id: "general" } }, courseChats: { visibleCourses: (courses) => courses },
    loadStudyMode: () => {}, activeStudyReply: () => null, mergeStudyReply: (messages) => messages,
    api(path) {
      const request = { path };
      requests.push(request);
      if (defer.includes(path)) return new Promise((resolve, reject) => Object.assign(request, { resolve, reject }));
      return Promise.resolve({ courses: [], documents: [], messages: [], items: [], conversations: [{ id: "default" }], classmates: [] });
    }
  });
  vm.runInContext(`let pageLoadGeneration = 0, classmatesGeneration = 0;\n${loaders}`, context);
  return { state, context, requests, notices, renders, type: (text) => { formDraft = text; }, draft: () => formDraft };
}

test("late study responses cannot overwrite courses or redraw a newly edited profile", async () => {
  const h = harness(["/api/courses"]);
  const old = h.context.loadPage("study");
  await h.context.loadPage("profile");
  h.type("Unsaved profile name");
  const renders = h.renders.length;
  h.requests[0].resolve({ courses: [{ id: "stale", name: "Old response" }] });
  await old;
  assert.equal(h.draft(), "Unsaved profile name");
  assert.equal(h.renders.length, renders);
  assert.equal(h.state.courses[0].id, "kept");
  assert.equal(h.requests.length, 1, "obsolete loads must stop before issuing more requests");
});

test("late tools and admin results cannot change the current page or its loading state", async () => {
  for (const page of ["tools", "admin"]) {
    const path = page === "tools" ? "/api/courses" : "/api/admin/overview";
    const h = harness([path, "/api/schedule/items"]);
    if (page === "admin") h.state.mode = "admin";
    const old = h.context.loadPage(page);
    h.state.mode = "student";
    const current = h.context.loadPage("schedule");
    const renders = h.renders.length;
    h.requests[0].resolve({ courses: [{ id: "stale" }], users: [{ id: "stale" }] });
    await old;
    assert.equal(h.state.busy, true, "old completion must not dismiss the new page's loading indicator");
    assert.equal(h.renders.length, renders);
    assert.equal(h.state.courses[0].id, "kept");
    assert.equal(h.state.admin, undefined);
    h.requests.find((request) => request.path === "/api/schedule/items").resolve({ courses: [{ id: "current" }], items: [] });
    await current;
    assert.equal(h.state.busy, false);
  }
});

test("obsolete failures and account changes cannot redraw pages or publish stale data", async () => {
  const h = harness(["/api/courses"]);
  const old = h.context.loadPage("study");
  await h.context.loadPage("profile");
  h.type("Keep this draft");
  h.requests[0].reject(new Error("Old request failed"));
  await old;
  assert.deepEqual(h.notices, []);
  assert.equal(h.draft(), "Keep this draft");

  const next = h.context.loadPage("study");
  h.state.user = { id: "bob" };
  h.requests[1].resolve({ courses: [{ id: "alice-private-course" }] });
  await next;
  assert.equal(h.state.courses[0].id, "kept");
});

test("out-of-order calendar loads retain the latest response", async () => {
  const h = harness(["/api/schedule/items"]);
  const old = h.context.loadPage("schedule");
  const current = h.context.loadPage("schedule");
  h.requests[1].resolve({ courses: [{ id: "current" }], items: [{ id: "new-event" }] });
  await current;
  h.requests[0].resolve({ courses: [{ id: "stale" }], items: [{ id: "stale-event" }] });
  await old;
  assert.equal(h.state.courses[0].id, "current");
  assert.equal(h.state.scheduleItems[0].id, "new-event");
});

test("normalized saved routes load the page that is actually shown", async () => {
  const h = harness();
  await h.context.loadPage("removed-old-route");
  assert.equal(h.state.page, "study");
  assert.ok(h.requests.some((request) => request.path === "/api/courses"));
  const email = harness();
  await email.context.loadPage("email");
  assert.equal(email.state.page, "email");
  assert.equal(email.requests[0].path, "/api/mailbox");
  const legacy = harness(); legacy.state.tool = "email";
  await legacy.context.loadPage("tools");
  assert.equal(legacy.state.page, "email");
  assert.equal(legacy.state.tool, "docs");
});

test("late conversation and document loads cannot repopulate abandoned study state", async () => {
  const h = harness(["/api/courses/kept/conversations"]);
  h.state.activeCourseId = h.state.conversationCourseId = "kept";
  h.context.api = (path) => {
    if (path === "/api/courses") return Promise.resolve({ courses: [{ id: "kept" }] });
    const request = { path };
    h.requests.push(request);
    return new Promise((resolve, reject) => Object.assign(request, { resolve, reject }));
  };
  const old = h.context.loadPage("study");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.requests[0].path, "/api/courses/kept/conversations");
  await h.context.loadPage("profile");
  h.requests[0].resolve({ conversations: [] });
  await old;
  assert.equal(h.requests.length, 1, "an abandoned page must not create an unnecessary conversation");
  assert.equal(h.state.courseConversations.kept, undefined);

  const docs = harness(["/api/courses/kept/documents", "/api/courses/kept/messages?conversationId=default"]);
  docs.state.activeCourseId = docs.state.conversationCourseId = "kept";
  const api = docs.context.api;
  docs.context.api = (path) => path === "/api/courses" ? Promise.resolve({ courses: [{ id: "kept" }] }) : api(path);
  const loading = docs.context.loadPage("study");
  await new Promise((resolve) => setImmediate(resolve));
  await docs.context.loadPage("profile");
  docs.type("Keep profile input");
  docs.requests.find((request) => request.path.endsWith("/documents")).resolve({ documents: [{ id: "stale-doc" }] });
  docs.requests.find((request) => request.path.includes("/messages?")).resolve({ messages: [{ id: "stale-message" }] });
  await loading;
  assert.equal(docs.state.docs, undefined);
  assert.equal(docs.state.messages, undefined);
  assert.equal(docs.draft(), "Keep profile input");
});
