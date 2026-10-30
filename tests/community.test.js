const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const helpers = source.slice(source.indexOf("  function communityValue()"), source.indexOf("  function communityPage()"));
const loader = source.slice(source.indexOf("  async function loadPage(page)"), source.indexOf("  function stopClassmatesLive()"));

function harness() {
  const state = {
    communityChannel: "school", communitySelections: { school: null, major: null },
    communityChoices: { schools: [], majors: [] }, community: null, communityError: ""
  };
  const requests = [];
  const notices = [];
  const context = vm.createContext({ ui: require("../public/i18n"),
    state, URLSearchParams, notices,
    profile: () => ({ school: "University of Toronto", major: "Computer Science" }),
    setPage: (page) => { state.page = page; },
    setToast: (message) => notices.push(message),
    api: (path) => path === "/api/community/notifications" ? Promise.resolve({ notifications: [] }) : new Promise((resolve, reject) => requests.push({ path, resolve, reject }))
  });
  // Rendering stops classmates polling on non-classmate pages, changing its generation.
  // Community loading must complete independently of that lifecycle.
  vm.runInContext(`let classmatesGeneration = 0; let pageLoadGeneration = 0;
    function render() { classmatesGeneration += 1; }
    ${helpers}\n${loader}`, context);
  return { state, requests, notices, context };
}

test("community queries use profile defaults and independent school/major choices", () => {
  const { state, context } = harness();
  assert.equal(vm.runInContext("communityValue()", context), "University of Toronto");
  state.communitySelections.school = "Arts & Science 学院";
  const query = new URLSearchParams(vm.runInContext("communityQuery()", context));
  assert.equal(query.get("value"), "Arts & Science 学院");
  state.communityChannel = "major";
  assert.equal(vm.runInContext("communityValue()", context), "Computer Science");
  state.communitySelections.major = "Psychology";
  state.communityChannel = "school";
  assert.equal(vm.runInContext("communityValue()", context), "Arts & Science 学院");
  state.communityChannel = "all";
  assert.equal(vm.runInContext("communityQuery()", context), "channel=all");
});

test("community loading survives polling cleanup and ignores a slower old selection", async () => {
  const { state, requests, context } = harness();
  const old = context.loadPage("community");
  state.communitySelections.school = "University of Waterloo";
  const current = context.loadPage("community");
  assert.equal(state.community, null);
  assert.equal(state.busy, true);
  requests[1].resolve({ channel: { label: "University of Waterloo" }, posts: [{ id: "current" }] });
  await current;
  assert.equal(state.busy, false);
  assert.equal(state.community.posts[0].id, "current");
  requests[0].resolve({ posts: [{ id: "stale" }] });
  await old;
  assert.equal(state.community.posts[0].id, "current");
});

test("channel failures show an error, while stale failures cannot overwrite a newer page", async () => {
  const { state, requests, notices, context } = harness();
  const failed = context.loadPage("community");
  requests[0].reject(new Error("Channel unavailable"));
  await failed;
  assert.equal(state.busy, false);
  assert.equal(state.community, null);
  assert.equal(state.communityError, "Channel unavailable");
  const stale = context.loadPage("community");
  await context.loadPage("profile");
  requests[1].reject(new Error("Stale error"));
  await stale;
  assert.equal(state.page, "profile");
  assert.deepEqual(notices, ["Channel unavailable"]);
});

test("a post save refreshes an in-flight feed and a delayed pre-edit response cannot restore old content", async () => {
  const { state, requests, context } = harness();
  const original = context.loadPage;
  const old = original("community");
  let refresh;
  context.loadPage = (page) => { refresh = original(page); return refresh; };
  const post = { id: "edited", content: "New content", topic: "New topic", channels: [{ key: "school:university-of-toronto" }] };
  context.updateEditedCommunityPost(post);
  assert.equal(requests.length, 3);
  requests[2].resolve({ schools: [], majors: [] });
  requests[1].resolve({ channel: { key: "school:university-of-toronto" }, posts: [post] });
  await refresh;
  requests[0].resolve({ posts: [{ id: "edited", content: "Old content" }] });
  await old;
  assert.equal(state.community.posts[0].content, "New content");
});
