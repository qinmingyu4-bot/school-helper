const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const boot = source.slice(source.indexOf("  async function startupApi("), source.indexOf('  document.addEventListener("click", async (event) => {'));

function harness(result, error, savedMode) {
  const paths = [], pages = [], requests = [], marks = [], state = {}, root = { innerHTML: "" };
  const context = vm.createContext({
    state, root, URL, AbortController, window: { setTimeout, clearTimeout, performance: { mark: name => marks.push(name) } },
    location: { href: "https://example.test/app?page=tools", search: "?page=tools" },
    history: { replaceState: (_state, _title, path) => paths.push(path) }, document: {},
    ui: require("../public/i18n"), esc: String, officeTools: { sharedLink: null, takeSharedLink() { return this.sharedLink; } },
    api: async (path) => {
      requests.push(path);
      if (path !== "/api/me?view=workspace") return {};
      if (error) throw error;
      return result;
    },
    render: () => { root.innerHTML = state.user ? "workspace" : "login-form"; },
    reportUserActivity: async () => {}, localStorage: { getItem: (key) => key === "studybridge.mode" ? savedMode : null },
    loadPage: async (page, { officeShare } = {}) => pages.push(officeShare ? { page, officeShare } : page)
  });
  const roles = source.slice(source.indexOf("  const isAdmin ="), source.indexOf("  const profile ="));
  vm.runInContext(roles + boot, context);
  return { context, paths, pages, requests, marks, state, root };
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
  assert.deepEqual(h.requests, ["/api/me?view=workspace", "/api/auth/google/config", "/api/auth/config"]);
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

test("valid session opens the requested tools workspace without requesting login configuration", async () => {
  const h = harness({ user: { id: "alice" } });
  await h.context.boot();
  assert.equal(h.state.user.id, "alice");
  assert.deepEqual(h.paths, []);
  assert.deepEqual(h.pages, ["tools"]);
  assert.deepEqual(h.requests, ["/api/me?view=workspace"]);
  assert.deepEqual(h.marks, [
    "studybridge:boot-start", "studybridge:session-settled",
    "studybridge:workspace-mounted", "studybridge:initial-page-settled"
  ]);
});

test("direct login starts session and configuration requests concurrently", async () => {
  const h = harness();
  h.context.location.href = "https://example.test/login?page=tools";
  const pending = new Map();
  h.context.api = path => new Promise((resolve, reject) => pending.set(path, { resolve, reject }));
  const started = h.context.boot();
  assert.deepEqual([...pending.keys()].sort(), ["/api/auth/config", "/api/auth/google/config", "/api/me?view=workspace"]);
  pending.get("/api/auth/google/config").resolve({ enabled: true });
  pending.get("/api/auth/config").reject(new Error("offline"));
  pending.get("/api/me?view=workspace").reject(Object.assign(new Error("Please log in"), { status: 401 }));
  await started;
  assert.equal(h.root.innerHTML, "login-form");
  assert.equal(h.state.googleEnabled, true);
  assert.match(h.state.toast, /注册配置/);
});

test("a stalled session aborts and offers a retry at the original URL", async () => {
  const h = harness();
  let expire, cleared;
  h.context.window.setTimeout = (callback, delay) => { expire = callback; assert.equal(delay, 10000); return 1; };
  h.context.window.clearTimeout = timer => { cleared = timer; };
  h.context.api = (path, { signal }) => new Promise((_resolve, reject) => {
    assert.equal(path, "/api/me?view=workspace");
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const started = h.context.boot();
  expire();
  await started;
  assert.equal(cleared, 1);
  assert.deepEqual(h.paths, []);
  assert.match(h.root.innerHTML, /location.reload/);
});

test('shared Office links open the corresponding editor after authentication', async () => {
  const h = harness({ user: { id: 'bob' } });
  h.context.location.href = 'https://example.test/app';
  h.context.officeTools.sharedLink = { kind: 'sheets' };
  await h.context.boot();
  assert.deepEqual(h.pages, [{ page: 'study', officeShare: { kind: 'sheets' } }]);
});

test("only creators and Co-admins can restore the saved invitation or developer workspace", async () => {
  for (const role of ["student", "co-admin", "admin"]) {
    const h = harness({ user: { id: "alice", role } }, null, "admin");
    await h.context.boot();
    assert.equal(h.state.mode, role === "student" ? "student" : "admin");
  }
});
