const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createController, alipayMarkup } = require("../public/billing");
const state = { userId: "alice", configured: true, visible: true, canCheckout: true, csrfToken: "csrf", realCharges: true, pricesApproved: true, termsVersion: "approved-v1",
  passes: { status: "none", plans: [{ id: "month", amount: 1999 }, { id: "semester", amount: 6999 }] } };
test("Alipay UI sends separate endpoint, consent, terms version and plan, without card subscription actions", async () => {
  const calls = [], redirects = [];
  const controller = createController({ channel: "alipay", getUser: () => ({ id: "alice" }), makeId: () => "request-alipay-1", redirect: (url) => redirects.push(url),
    request: async (path, options) => { calls.push({ path, options }); return path === "/api/billing/alipay" ? { alipay: state } : { url: "https://checkout.stripe.com/c/pay/fixture" }; } });
  await controller.activate(); await controller.act("checkout", false, "month"); assert.equal(calls.length, 1);
  for (const action of ["portal", "resume", "pass-checkout"]) await controller.act(action, true, "month");
  await controller.act("checkout", true, "lifetime"); assert.equal(calls.length, 1);
  await controller.act("checkout", true, "semester");
  assert.equal(calls[1].path, "/api/billing/alipay/checkout"); assert.equal(calls[1].options.headers["x-csrf-token"], "csrf");
  assert.deepEqual(calls[1].options.body, { userId: "alice", plan: "semester", consent: true, requestId: "request-alipay-1", termsVersion: "approved-v1" });
  assert.equal(redirects.length, 1);
});
test("Alipay draft/closed UI disables purchases, distinguishes real charges and hides owner panel for other users", async () => {
  const markup = alipayMarkup({ data: { ...state, canCheckout: false, pricesApproved: false }, busy: false }, false);
  assert.match(markup, /data-alipay-action="checkout"[^>]*disabled/g); assert.match(markup, /data-alipay-consent[^>]*disabled/);
  assert.match(markup, /Draft prices|草案价格/); assert.match(markup, /real payment|真实付款/);
  assert.equal(alipayMarkup({ data: { ...state, visible: false } }, false), "");
  let calls = 0;
  const controller = createController({ channel: "alipay", getUser: () => ({ id: "alice" }), request: async () => { calls++; return { alipay: { ...state, canCheckout: false } }; } });
  await controller.activate(); await controller.act("checkout", true, "month"); assert.equal(calls, 1);
});
test("Alipay late redirects are ignored after settings close or account switch", async () => {
  for (const action of ["close", "switch"]) {
    let resolve, user = { id: "alice" }; const pending = new Promise((done) => { resolve = done; }), redirects = [];
    const controller = createController({ channel: "alipay", getUser: () => user, makeId: () => "alipay-request-late", redirect: (url) => redirects.push(url),
      request: async (path) => path === "/api/billing/alipay" ? { alipay: state } : pending });
    await controller.activate(); const work = controller.act("checkout", true, "month");
    if (action === "close") controller.suspend(); else user = { id: "bob" };
    resolve({ url: "https://checkout.stripe.com/c/pay/fixture" }); await work; assert.equal(redirects.length, 0);
  }
});
