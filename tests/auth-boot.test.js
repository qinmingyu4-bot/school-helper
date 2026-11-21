const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const boot = source.slice(source.indexOf("  async function boot()"), source.indexOf('  document.addEventListener("click", async (event) => {'));

function harness(result, error) {
  const paths = [], pages = [], state = {}, root = { innerHTML: "" };
  const context = vm.createContext({
    state, root, URL, location: { href: "https://example.test/app?page=tools", search: "?page=tools" },
    history: { replaceState: (_state, _title, path) => paths.push(path) }, document: {},
    ui: require("../public/i18n"), esc: String, officeTools: { sharedLink: null, takeSharedLink() { return this.sharedLink; } },
    api: async (path) => {
      if (path !== "/api/me") return {};
      if (error) throw error;
      return result;
    },
    render: () => { root.innerHTML = state.user ? "workspace" : "login-form"; },
    reportUserActivity: async () => {}, localStorage: { getItem: () => null }, isAdmin: () => false,
    loadPage: async (page, { officeShare } = {}) => pages.push(officeShare ? { page, officeShare } : page)
  });
  vm.runInContext(boot, context);
  return { context, paths, pages, state, root };
}

for (const [label, error] of [
  ["network failure", new TypeError("Failed to fetch")],
  ["server failure", Object.assign(new Error("Unavailable"), { status: 503 })],
  ["rate limit", Object.assign(new Error("Too many requests"), { status: 429 })]
]) {
  test(`${label} must not send the user to login`, async () => {
    const h = harness(null, error);
    await h.context.boot();
    assert.deepEqual(h.paths, []);
    assert.notEqual(h.root.innerHTML, "login-form");
    assert.match(h.root.innerHTML, /location.reload/);
  });
}

test("only confirmed unauthenticated responses open login", async () => {
  const h = harness(null, Object.assign(new Error("Please log in"), { status: 401 }));
  await h.context.boot();
  assert.deepEqual(h.paths, ["/login?page=tools"]);
  assert.equal(h.root.innerHTML, "login-form");
});

test("malformed successful responses are not treated as signed out", async () => {
  for (const result of [{}, null, { user: {} }]) {
    const h = harness(result);
    await h.context.boot();
    assert.deepEqual(h.paths, []);
    assert.match(h.root.innerHTML, /location.reload/);
  }
});

test("valid session opens the requested tools workspace", async () => {
  const h = harness({ user: { id: "alice" } });
  await h.context.boot();
  assert.equal(h.state.user.id, "alice");
  assert.deepEqual(h.paths, []);
  assert.deepEqual(h.pages, ["tools"]);
});

test('shared Office links open the corresponding editor after authentication', async () => {
  const h = harness({ user: { id: 'bob' } });
  h.context.location.href = 'https://example.test/app';
  h.context.officeTools.sharedLink = { kind: 'sheets' };
  await h.context.boot();
  assert.deepEqual(h.pages, [{ page: 'study', officeShare: { kind: 'sheets' } }]);
});
