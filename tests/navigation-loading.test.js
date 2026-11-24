const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const loaders = source.slice(source.indexOf("  const studyHistoryCache ="), source.indexOf("  function stopClassmatesLive()"));

test("hidden mobile Study coalesces incoming reply paints and restores the final text on reopen", () => {
  let view = "menu", queries = 0, composerResizes = 0, removed = false;
  const paints = [];
  const content = {};
  const body = { querySelector: (selector) => selector === ".reply-content" ? content : { remove: () => { removed = true; } } };
  const message = { setAttribute() {}, querySelector: () => body };
  const chat = { scrollHeight: 200, scrollTop: 0, clientHeight: 100 };
  const send = { dataset: { action: "send-chat" }, setAttribute() {} };
  const context = vm.createContext({
    deferredStudyReply: null, deferredStudyTasks: false, studyTasks: null,
    state: { page: "study", mode: "student", busy: false },
    mobileNavigation: { snapshot: () => ({ active: true, view, panel: false }) },
    classmateNotifications: { reconcileToast() {} }, studyComposer: { resize: () => composerResizes++ },
    studyReplyKey: () => "alice/chat", activeStudyReply: () => null, updateStudySummaryButton() {},
    ui: require("../public/i18n"), window: { StudyBridgeMarkdown: { renderInto: (_node, text) => paints.push(text) } },
    root: { querySelector(selector) { queries++; return selector === ".study-workspace .chat-area" ? chat
      : selector === ".compose-row .send" ? send : selector.endsWith(" > div") ? null : message; } }
  });
  vm.runInContext(source.slice(source.indexOf("  function studyWorkspaceVisible()"), source.indexOf("  function mergeStudyReply(")), context);
  const reply = { key: "alice/chat", user: { clientReplyId: "q" }, assistant: { content: "First", pending: true, clientReplyId: "a" } };
  context.scheduleStudyReply(reply);
  reply.assistant.content += " and final";
  reply.assistant.pending = false;
  context.updateStudyReply(reply);
  assert.equal(queries, 0);
  assert.deepEqual(paints, []);
  view = "page";
  context.resumeStudyWorkspace();
  assert.deepEqual(paints, ["First and final"]);
  assert.equal(removed, true);
  assert.equal(composerResizes, 1);
  assert.equal(context.deferredStudyReply, null);
});

function harness(defer = []) {
  const requests = [], notices = [], renders = [];
  const storage = new Map(), drafts = new Map();
  const state = { user: { id: "alice", name: "Alice" }, mode: "student", page: "profile", tool: "docs",
    courses: [{ id: "kept", name: "Saved course" }], activeCourseId: "general", activeConversationId: "default",
    conversationCourseId: "general", courseConversations: {}, expandedCourses: {}, courseConversationErrors: {}, scheduleItems: [],
    communityChannel: "all", communityChoices: {}, activeClassmateId: "", classmateChatOpen: false };
  let formDraft = "";
  const context = vm.createContext({ ui: require("../public/i18n"), scheduleImport: require("../public/schedule-import"),
    state, URLSearchParams, root: { querySelector: () => null }, studyTasks: null, esc: (value) => String(value ?? ""),
    studyDrafts: drafts, studyReplyKey: (user = state.user.id, course = state.activeCourseId, conversation = state.activeConversationId) => JSON.stringify([user, course, conversation]),
    $: () => ({ value: formDraft }), mobileNavigation: { closeStudyPanel() {} },
    setPage(page) {
      if (page === "tools" && state.tool === "email") { page = "email"; state.tool = "docs"; }
      state.page = state.mode === "admin" ? "admin" : ["study", "schedule", "tools", "email", "profile", "community", "classmates"].includes(page) ? page : "study";
    },
    render() { renders.push(state.page); formDraft = ""; },
    updateStudyMaterials() {}, updateStudySchedule() {},
    updateCourseFolder(id) { renders.push(`folder:${id}:${state.expandedCourses[id]}`); },
    setToast: (message) => notices.push(message), syncClassmatesLive: () => {},
    communityQuery: () => "channel=all", communityValue: () => "",
    officeTools: { supports: () => true }, creativeTools: { load: async () => {} }, creativeContext: () => ({}),
    mailboxView: { load: async () => { requests.push({ path: "/api/mailbox" }); } },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) }, isGeneralChat: () => state.activeCourseId === "general",
    chatSpaces: { general: { id: "general" } }, courseChats: { visibleCourses: (courses) => courses },
    loadStudyMode: () => {}, activeStudyReply: () => null, mergeStudyReply: (messages) => messages,
    api(path) {
      const request = { path };
      requests.push(request);
      if (defer.includes(path)) return new Promise((resolve, reject) => Object.assign(request, { resolve, reject }));
      return Promise.resolve({ courses: [], documents: [], messages: [], items: [], conversations: [{ id: "default" }], classmates: [] });
    }
  });
  const roles = source.slice(source.indexOf("  const isAdmin ="), source.indexOf("  const profile ="));
  vm.runInContext(`let pageLoadGeneration = 0, classmatesGeneration = 0;\n${roles}${loaders}`, context);
  vm.runInContext(source.slice(source.indexOf("  function courseFolderHtml("), source.indexOf("  // Patch only the folder:")), context);
  return { state, context, requests, notices, renders, storage, drafts, type: (text) => { formDraft = text; }, draft: () => formDraft };
}

test("feature switches keep desktop sidebar scroll, scoped to the account and mode", () => {
  const sidebarHtml = source.slice(source.indexOf("  function sidebarHtml("), source.indexOf("  // Keep the main icons"));
  const avatarHtml = source.slice(source.indexOf("  function profileAvatarHtml("), source.indexOf("  function profilePage("));
  const capture = source.slice(source.indexOf("    const previousAdminWorkspace ="), source.indexOf("    const previousSchedule ="));
  const restore = source.slice(source.indexOf('    const sidebar = root.querySelector(".sidebar");', source.indexOf("  function render()")), source.indexOf('    const chat = root.querySelector(".study-workspace .chat-area");', source.indexOf("  function render()")));
  const state = { user: { id: "alice", name: "Alice" }, mode: "student", page: "grades" };
  let sidebar, workspace = { scrollTop: 0 }, mobile = false;
  const context = vm.createContext({
    state, ui: require("../public/i18n"), esc: (value) => String(value ?? ""),
    profile: () => ({}), profileSbId: () => "alice", brandMarkHtml: () => "", initials: () => "A",
    navButton: () => "", canManageInvites: () => false, isAdmin: () => false,
    usageView: { disclosureHtml: () => "" },
    window: { scrollX: 0, scrollY: 0, scrollTo() {} },
    mobileNavigation: { snapshot: () => ({ active: mobile }) },
    root: { querySelector: (selector) => selector === ".sidebar" ? sidebar : selector === ".workspace" ? workspace : null },
    mount(nextSidebar) {
      const tag = nextSidebar.match(/<aside[^>]*>/)[0];
      sidebar = { scrollTop: 0, scrollHeight: 720, clientHeight: 480, dataset: {
        sidebarContext: tag.match(/data-sidebar-context="([^"]*)"/)?.[1],
        sidebarPage: tag.match(/data-sidebar-page="([^"]*)"/)?.[1],
      } };
      workspace = { scrollTop: 0 };
    }
  });
  context.window.StudyBridgeI18n = context.ui;
  vm.runInContext(fs.readFileSync(require.resolve("../public/storage-quota.js"), "utf8"), context);
  context.storageView = context.window.StudyBridgeStorage.create({ getUser: () => state.user });
  vm.runInContext(`${sidebarHtml}${avatarHtml}
    function renderSidebar() {
      ${capture}
      mount(sidebarHtml());
      ${restore}
    }
  `, context);
  assert.match(context.sidebarHtml(), /data-action="open-storage"/);
  context.mount(context.sidebarHtml());
  sidebar.scrollTop = 205;
  for (const page of ["schedule", "schedule", "tools"]) {
    state.page = page;
    context.renderSidebar();
    assert.equal(sidebar.scrollTop, 205);
  }

  state.user = { id: "bob", name: "Bob" };
  context.renderSidebar();
  assert.equal(sidebar.scrollTop, 0);
  sidebar.scrollTop = 150;
  state.mode = "admin";
  state.page = "admin";
  assert.doesNotMatch(context.sidebarHtml(), /data-action="open-storage"/);
  context.renderSidebar();
  assert.equal(sidebar.scrollTop, 0);

  mobile = true;
  state.mode = "student";
  state.page = "schedule";
  context.renderSidebar();
  sidebar.scrollTop = 205;
  workspace.scrollTop = 180;
  context.renderSidebar();
  assert.equal(sidebar.scrollTop, 205);
  assert.equal(workspace.scrollTop, 180);
  state.page = "tools";
  context.renderSidebar();
  assert.equal(sidebar.scrollTop, 0);
  assert.equal(workspace.scrollTop, 0);
});

test("a chat summary opens its saved Docs file once and leaves later navigation alone", async () => {
  const summaryRoute = "/api/courses/general/chat-summary";
  const logic = source.slice(source.indexOf("  function canSummarizeStudyChat()"), source.indexOf("  function studyPage()"));
  for (const navigateAway of [false, true]) {
    const h = harness([summaryRoute]);
    const button = { setAttribute() {} }, invalidated = [];
    Object.assign(h.context, {
      activeStudyTask: () => null, studyHistoryPending: () => false, studySummaries: new Set(),
      root: { querySelector: () => button }, crypto: require("node:crypto"),
    });
    h.context.officeTools.invalidate = (id) => invalidated.push(id);
    h.state.page = "study";
    h.state.messages = [{ id: "saved-turn", content: "A saved study message." }];
    vm.runInContext(logic, h.context);
    const pending = h.context.summarizeStudyChat();
    await h.context.summarizeStudyChat();
    assert.equal(h.requests.length, 1);
    assert.equal(button.disabled, true);
    if (navigateAway) await h.context.loadPage("profile");
    h.requests[0].resolve({ project: { id: "office_summary", name: "Saved summary" } });
    await pending;
    assert.deepEqual(invalidated, ["alice"]);
    assert.equal(h.state.page, navigateAway ? "profile" : "tools");
    if (!navigateAway) {
      assert.equal(h.state.tool, "docs");
      assert.equal(h.state.toolView, "edit");
      assert.equal(h.state.officeEntry.id, "office_summary");
      assert.equal(h.requests.length, 1, "Opening the saved project does not reload Study courses");
    }
  }
});

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

test("a late course directory does not redraw an Office file card or opening editor", async () => {
  const h = harness(["/api/courses"]);
  h.state.tool = "slides";
  const pending = h.context.loadPage("tools");
  h.state.toolView = "edit";
  h.state.officeEntry = { id: "slides-first", key: "open" };
  h.requests[0].resolve({ courses: [{ id: "refreshed" }] });
  await pending;
  assert.deepEqual(h.renders, ["tools"]);
  assert.equal(h.state.officeEntry.id, "slides-first");
  assert.equal(h.state.courses[0].id, "refreshed");
  assert.equal(h.state.busy, false);
});

test("late tools and admin results cannot change the current page or its loading state", async () => {
  for (const [page, role, path] of [
    ["tools", "student", "/api/courses"],
    ["admin", "admin", "/api/admin/overview"],
    ["admin", "co-admin", "/api/admin/invites"]
  ]) {
    const h = harness([path, "/api/schedule/items"]);
    h.state.user.role = role;
    if (page === "admin") h.state.mode = "admin";
    const old = h.context.loadPage(page);
    h.state.mode = "student";
    const current = h.context.loadPage("schedule");
    const renders = h.renders.length;
    assert.equal(h.requests[0].path, path);
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
  assert.ok(h.requests.some(request => request.path === "/api/courses/kept/conversations"));
  await h.context.loadPage("profile");
  h.requests.find(request => request.path.endsWith("/conversations")).resolve({ conversations: [] });
  await old;
  assert.equal(h.requests.length, 2, "an abandoned page must not create an unnecessary conversation beyond its speculative reads");
  assert.equal(h.state.courseConversations.kept, undefined);

  const docs = harness(["/api/courses/kept/documents?summary=1", "/api/courses/kept/messages?conversationId=default"]);
  docs.state.activeCourseId = docs.state.conversationCourseId = "kept";
  const api = docs.context.api;
  docs.context.api = (path) => path === "/api/courses" ? Promise.resolve({ courses: [{ id: "kept" }] }) : api(path);
  const loading = docs.context.loadPage("study");
  await new Promise((resolve) => setImmediate(resolve));
  await docs.context.loadPage("profile");
  docs.type("Keep profile input");
  docs.requests.find((request) => request.path.endsWith("/documents?summary=1")).resolve({ documents: [{ id: "stale-doc" }] });
  docs.requests.find((request) => request.path.includes("/messages?")).resolve({ messages: [{ id: "stale-message" }] });
  await loading;
  assert.equal(docs.state.docs.length, 0);
  assert.equal(docs.state.messages.length, 0);
  assert.equal(docs.draft(), "Keep profile input");
});


test("course arrows reopen immediately and remain usable when the list request fails", async () => {
  const h = harness(["/api/courses/kept/conversations"]);
  h.state.page = "study"; h.state.expandedCourses.kept = true;
  h.state.courseConversations.kept = [{id:"saved",title:"Keep this chat"}];
  h.type("Keep my unsent question");
  await h.context.toggleCourseFolder("kept");
  assert.equal(h.state.expandedCourses.kept,false);
  const opening = h.context.toggleCourseFolder("kept");
  assert.equal(h.state.expandedCourses.kept,true,"opening must not wait for the server");
  h.requests[0].reject(new Error("Offline"));await opening;
  assert.equal(h.state.expandedCourses.kept,true);
  assert.equal(h.state.courseConversationErrors.kept,true);
  assert.equal(h.state.courseConversations.kept[0].id,"saved");
  assert.equal(h.draft(),"Keep my unsent question");
  const retry=h.context.toggleCourseFolder("kept",true);
  h.requests[1].resolve({conversations:[{id:"fresh"}]});await retry;
  assert.equal(h.state.courseConversationErrors.kept,undefined);
  assert.equal(h.state.courseConversations.kept[0].id,"fresh");
});

test("rapid course toggles follow the last click and reject stale list responses", async () => {
  const h=harness(["/api/courses/kept/conversations"]);h.state.page="study";
  const first=h.context.toggleCourseFolder("kept");
  await h.context.toggleCourseFolder("kept");
  const last=h.context.toggleCourseFolder("kept");
  h.requests[1].resolve({conversations:[{id:"latest"}]});await last;
  h.requests[0].resolve({conversations:[{id:"old"}]});await first;
  assert.equal(h.state.expandedCourses.kept,true);
  assert.equal(h.state.courseConversations.kept[0].id,"latest");
  await h.context.toggleCourseFolder("kept");
  const pending=h.context.toggleCourseFolder("kept");
  await h.context.toggleCourseFolder("kept");
  h.requests[2].resolve({conversations:[{id:"closed"}]});await pending;
  assert.equal(h.state.expandedCourses.kept,false);
  assert.equal(h.state.courseConversations.kept[0].id,"latest");
});

test("late course folder loads cannot update another page, account or deleted course", async () => {
  for(const change of [h=>{h.state.user={id:"bob"};},h=>{h.state.page="profile";},h=>{h.state.courses=[];}]) {
    const h=harness(["/api/courses/kept/conversations"]);h.state.page="study";
    const pending=h.context.toggleCourseFolder("kept");change(h);
    const renders=h.renders.length;
    h.requests[0].resolve({conversations:[{id:"private"}]});await pending;
    assert.equal(h.state.courseConversations.kept,undefined);
    assert.equal(h.renders.length,renders);
  }
});

test("feature loading failures preserve the signed-in user and current workspace", async () => {
  for (const [page, path] of [["tools", "/api/courses"], ["study", "/api/courses"], ["schedule", "/api/schedule/items"]]) {
    for (const status of [401, 429, 503]) {
      const h = harness([path]);
      const loading = h.context.loadPage(page);
      h.requests.find((request) => request.path === path).reject(Object.assign(new Error("Request failed"), { status }));
      await loading;
      assert.equal(h.state.user.id, "alice");
      assert.equal(h.state.page, page);
      assert.equal(h.state.busy, false);
      assert.ok(h.notices.includes("Request failed"));
    }
  }
});

test("course heading and current conversation preserve history and drafts even when requests would fail", async () => {
  const h = harness(["/api/courses"]);
  Object.assign(h.state, { page: "study", activeCourseId: "kept", conversationCourseId: "kept",
    activeConversationId: "default", messages: [{ id: "history", content: "Saved question" }], docs: [], uploadFiles: [] });
  h.state.expandedCourses.kept = true;
  h.storage.set("studybridge.conversation.alice.kept", "stale-other-chat");
  h.type("Unsent question");
  const history = h.state.messages;
  await h.context.selectCourse("kept");
  await h.context.selectConversation("kept", "default");
  assert.equal(h.state.activeConversationId, "default");
  assert.equal(h.state.messages, history);
  assert.equal(h.draft(), "Unsent question");
  assert.equal(h.requests.length, 0);
  assert.equal(h.renders.length, 0);
});

test("switching conversations loads their own history and remembers resolved stale IDs", async () => {
  const h = harness();
  Object.assign(h.state, { page: "study", activeCourseId: "kept", conversationCourseId: "kept",
    messages: [{ id: "default-history" }], uploadFiles: [] });
  h.context.api = async (path) => {
    h.requests.push({ path });
    if (path === "/api/courses") return { courses: [{ id: "kept" }] };
    if (path.endsWith("/conversations")) return { conversations: [{ id: "default" }, { id: "second" }] };
    if (path.includes("/messages?")) return { messages: [{ id: path.endsWith("=second") ? "second-history" : "default-history" }] };
    return { documents: [], items: [] };
  };
  await h.context.selectConversation("kept", "second");
  assert.equal(h.state.messages[0].id, "second-history");
  await h.context.selectConversation("kept", "default");
  assert.equal(h.state.messages[0].id, "default-history");
  await h.context.selectConversation("kept", "deleted-chat");
  assert.equal(h.state.activeConversationId, "default");
  assert.equal(h.storage.get("studybridge.conversation.alice.kept"), "default");
  assert.equal(h.state.messages[0].id, "default-history");
});

test("reselecting a chat during loading does not invalidate the pending history request", async () => {
  const h = harness(["/api/courses"]);
  h.state.uploadFiles = [];
  const loading = h.context.selectConversation("general", "default");
  await h.context.selectCourse("general");
  await h.context.selectConversation("general", "default");
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ courses: [] });
  await loading;
  assert.ok(h.requests.some((request) => request.path === "/api/courses/general/messages?conversationId=default"));
  assert.equal(h.state.busy, false);
});

test("an empty chat after a failed load can still be retried by selecting it", async () => {
  const h = harness(["/api/courses"]);
  Object.assign(h.state, { page: "study", messages: [], uploadFiles: [], busy: false });
  const retry = h.context.selectConversation("general", "default");
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ courses: [] });
  await retry;
  assert.equal(h.state.busy, false);
});


test("an unvisited course immediately shows default chat, without reviving a known deleted default", () => {
  const h = harness(); h.state.expandedCourses.kept = true;
  assert.match(h.context.courseFolderHtml({ id: "kept", name: "New course" }), /data-conversation="default"/);
  h.state.courseConversations.kept = [];
  assert.doesNotMatch(h.context.courseFolderHtml({ id: "kept", name: "New course" }), /data-conversation="default"/);
});

test("course switch restores its cached history immediately and failed refresh remains retryable", async () => {
  const h = harness();
  Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  h.context.api = async (path) => {
    if (path === "/api/courses") return { courses: [{ id: "ap" }, { id: "rsm" }] };
    if (path.endsWith("/conversations")) return { conversations: [{ id: "default" }] };
    if (path.includes("/messages?")) return { messages: [{ id: path.includes("/ap/") ? "ap-history" : "rsm-history" }] };
    return { documents: [], items: [] };
  };
  await h.context.selectCourse("ap");
  await h.context.selectCourse("rsm");
  const normal = h.context.api;
  let reject;
  h.context.api = (path) => path.includes("/ap/messages?") ? new Promise((_, fail) => { reject = fail; }) : normal(path);
  const returning = h.context.selectCourse("ap");
  assert.equal(h.state.messages[0].id, "ap-history", "restore before any network response");
  assert.equal(h.state.studyHistoryLoading, true);
  await new Promise(resolve => setImmediate(resolve));
  reject(new Error("Offline")); await returning;
  assert.equal(h.state.messages[0].id, "ap-history");
  assert.equal(h.state.studyHistoryError, "Offline");
  h.context.api = normal;
  await h.context.selectCourse("ap");
  assert.equal(h.state.studyHistoryError, "");
  assert.equal(h.state.messages[0].id, "ap-history");
});

test("default list is updated before slow history and schedule finish, and repeated clicks do not restart loading", async () => {
  const h = harness(); Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  let resolveHistory;
  h.context.api = async (path) => {
    h.requests.push({ path });
    if (path === "/api/courses") return { courses: [{ id: "kept" }] };
    if (path.endsWith("/conversations")) return { conversations: [{ id: "default" }] };
    if (path.includes("/messages?")) return new Promise(resolve => { resolveHistory = resolve; });
    return { documents: [], items: [] };
  };
  const loading = h.context.selectCourse("kept");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.renders.includes("folder:kept:true"));
  assert.equal(h.state.studyHistoryLoading, true);
  await h.context.selectConversation("kept", "default");
  assert.equal(h.requests.filter(r => r.path === "/api/courses").length, 0);
  resolveHistory({ messages: [] }); await loading;
  assert.equal(h.state.studyHistoryLoading, false);
  assert.equal(h.state.studyHistoryError, "");
});

test("overlapping empty-course selections share creation and use the default title", async () => {
  const h = harness(); let finish; const writes = [];
  h.context.api = (path, options) => { writes.push(options); return new Promise(resolve => { finish = resolve; }); };
  const a = h.context.createEmptyCourseChat("kept"), b = h.context.createEmptyCourseChat("kept");
  assert.equal(a, b); assert.equal(writes.length, 1); assert.equal(writes[0].body.title, "默认对话");
  finish({ conversation: { id: "replacement" } }); await a;
});

test("malformed conversation responses do not create a replacement chat", async () => {
  const h = harness(); Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  h.context.api = async (path, options) => {
    assert.notEqual(options?.method, "POST");
    return path === "/api/courses" ? { courses: [{ id: "kept" }] } : {};
  };
  await h.context.selectCourse("kept");
  assert.ok(h.state.studyHistoryError);
  assert.equal(h.state.courseConversations.kept, undefined);
});

test("a loaded empty default chat is stable on repeated course and conversation clicks", async () => {
  const h = harness(); Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  await h.context.selectCourse("kept");
  const count = h.requests.length, renders = h.renders.length;
  await h.context.selectCourse("kept");
  await h.context.selectConversation("kept", "default");
  assert.equal(h.requests.length, count);
  assert.equal(h.renders.length, renders);
  assert.equal(h.state.studyHistoryLoading, false);
});

test("slow materials and calendar do not block history or discard a draft on arrival", async () => {
  const h = harness(["/api/courses/kept/documents?summary=1", "/api/schedule/items"]);
  Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  let materials = 0, schedule = 0;
  h.context.updateStudyMaterials = () => materials++;
  h.context.updateStudySchedule = () => schedule++;
  await h.context.selectCourse("kept");
  assert.equal(h.state.busy, false, "chat is ready even while optional requests are unresolved");
  assert.equal(h.state.studyHistoryLoading, false);
  assert.equal(h.state.studyDocsLoading, true);
  assert.equal(h.requests.some(r => r.path === "/api/courses"), false, "known course selection avoids reloading the entire directory");
  h.type("Keep typing"); const renders = h.renders.length;
  h.requests.find(r => r.path.endsWith("/documents?summary=1")).resolve({ documents: [{ id: "material" }] });
  h.requests.find(r => r.path === "/api/schedule/items").resolve({ items: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.docs[0].id, "material");
  assert.equal(h.state.studyDocsLoading, false);
  assert.equal(h.draft(), "Keep typing"); assert.equal(h.renders.length, renders);
  assert.equal(materials, 2); assert.equal(schedule, 1);
});

test("material and calendar failures leave chat usable and material retry recovers independently", async () => {
  const h = harness(["/api/courses/kept/documents?summary=1", "/api/schedule/items"]);
  Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  await h.context.selectCourse("kept");
  h.requests.find(r => r.path.endsWith("/documents?summary=1")).reject(new Error("Unavailable"));
  h.requests.find(r => r.path === "/api/schedule/items").reject(new Error("Unavailable"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.studyDocsError, true);
  assert.equal(h.state.studyHistoryError, ""); assert.equal(h.state.busy, false);
  h.context.api = async () => ({ documents: [{ id: "recovered" }] });
  h.type("My question"); const renders = h.renders.length;
  await h.context.loadStudyMaterials("kept", () => true);
  assert.equal(h.state.studyDocsError, false); assert.equal(h.state.docs[0].id, "recovered");
  assert.equal(h.draft(), "My question"); assert.equal(h.renders.length, renders);
});

test("directory, history and task state start together and task restoration makes no second request", async () => {
  const h = harness(); Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  const pending = new Map();
  h.context.api = (path) => {
    h.requests.push({ path });
    if (/\/conversations$|\/messages\?|\/study-jobs\?/.test(path)) return new Promise(resolve => pending.set(path, resolve));
    return Promise.resolve({ documents: [], items: [] });
  };
  h.context.studyTasks = require("../public/study-tasks").create({ request: h.context.api,
    getContext: () => ({ userId: h.state.user.id, courseId: h.state.activeCourseId, conversationId: h.state.activeConversationId }) });
  const loading = h.context.selectCourse("kept");
  assert.equal(pending.size, 3, "all three critical reads are in flight before any result arrives");
  pending.get("/api/courses/kept/messages?conversationId=default")({ messages: [{ id: "saved" }] });
  pending.get("/api/courses/kept/study-jobs?conversationId=default")({ jobs: [] });
  pending.get("/api/courses/kept/conversations")({ conversations: [{ id: "default" }] });
  await loading;
  assert.equal(h.state.messages[0].id, "saved");
  assert.equal(h.requests.filter(r => r.path.includes("/study-jobs?")).length, 1);
  assert.equal(h.state.busy, false);
  h.context.studyTasks.clear();
});

test("failed speculative reads for a deleted saved chat cannot replace the resolved default history", async () => {
  const h = harness(); Object.assign(h.state, { uploadFiles: [], docs: [], messages: [] });
  h.context.api = async path => {
    if (path.endsWith("/conversations")) return { conversations: [{ id: "default" }] };
    if (path.includes("conversationId=deleted")) throw new Error("Conversation not found");
    if (path.includes("/messages?")) return { messages: [{ id: "default-history" }] };
    return { documents: [], items: [] };
  };
  await h.context.selectConversation("kept", "deleted");
  assert.equal(h.state.activeConversationId, "default");
  assert.equal(h.state.messages[0].id, "default-history");
  assert.equal(h.state.studyHistoryError, "");
});
