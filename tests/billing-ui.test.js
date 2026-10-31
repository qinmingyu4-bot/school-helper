const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createController, redirectAllowed } = require("../public/billing");
const state = { userId: "alice", configured: true, csrfToken: "session-csrf", canCheckout: true, subscription: { status: "none" } };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
test("billing UI requires consent, sends server-owned identity/CSRF and prevents duplicate checkout clicks", async () => {
  const pending = deferred(), calls = [], redirects = [];
  const controller = createController({ getUser: () => ({ id: "alice" }), makeId: () => "request-0001", redirect: (url) => redirects.push(url), request: async (path, options) => {
    calls.push({ path, options }); return path === "/api/billing" ? { billing: state } : pending.promise;
  } });
  await controller.activate(); await controller.act("checkout"); assert.equal(calls.length, 1);
  const first = controller.act("checkout", true); await controller.act("checkout", true);
  assert.equal(calls.length, 2); assert.equal(calls[1].options.headers["x-csrf-token"], "session-csrf");
  assert.deepEqual(calls[1].options.body, { userId: "alice", consent: true, requestId: "request-0001" });
  pending.resolve({ url: "https://checkout.stripe.com/c/pay/test" }); await first;
  assert.equal(redirects.length, 1);
});
test("closing settings, signing out and switching accounts reject late checkout redirects and reads", async () => {
  for (const action of ["close", "switch", "dispose"]) {
    let user = { id: "alice" }; const pending = deferred(), redirects = [], changes = [];
    const controller = createController({ getUser: () => user, onChange: (value) => changes.push(value), redirect: (url) => redirects.push(url),
      makeId: () => "request-0001", request: async (path) => path === "/api/billing" ? { billing: state } : pending.promise });
    await controller.activate(); const work = controller.act("checkout", true), before = changes.length;
    if (action === "close") controller.suspend(); else if (action === "switch") user = { id: "bob" }; else controller.dispose();
    pending.resolve({ url: "https://checkout.stripe.com/c/pay/test" }); await work;
    assert.equal(redirects.length, 0); assert.equal(changes.length, before);
  }
  const pending = deferred(); let user = { id: "alice" };
  const controller = createController({ getUser: () => user, request: () => pending.promise });
  const loading = controller.activate(); user = null; pending.resolve({ billing: state }); await loading;
  assert.equal(controller.snapshot().data, null);
});
test("billing UI preserves failures for retry and rejects missing, foreign or unsafe redirect responses", async () => {
  for (const response of [{ billing: { ...state, userId: "bob" } }, { url: "javascript:alert(1)" }, { url: "https://checkout.stripe.com.evil.test/a" }, {}]) {
    const controller = createController({ getUser: () => ({ id: "alice" }), makeId: () => "request-0001", request: async (path) => path === "/api/billing" ? { billing: state } : response });
    await controller.activate(); await controller.act("checkout", true); assert.ok(controller.snapshot().error); assert.equal(controller.snapshot().busy, false);
  }
  for (const url of ["http://checkout.stripe.com/x", "https://checkout.stripe.com:8443/x", "https://user@checkout.stripe.com/x"]) assert.equal(redirectAllowed(url, "checkout"), false);
  assert.equal(redirectAllowed("https://billing.stripe.com/p/session/x", "portal"), true);
  let calls = 0;
  const disabled = createController({ getUser: () => ({ id: "alice" }), request: async () => { calls++; return { billing: { ...state, configured: false } }; } });
  await disabled.activate(); await disabled.act("checkout", true); assert.equal(calls, 1);
});
