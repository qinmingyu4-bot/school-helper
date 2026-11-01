const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prepare, renderEnv, parseEnv, EVENTS, ORIGIN } = require("../aws/configure-alipay");
const ACCOUNT = "acct_fixture";
const { API_VERSION } = require("../lib/billing-service");
const payload = { secretKey: "sk_live_fixture", webhookSecret: "whsec_fixture", webhookId: "we_fixture", monthPriceId: "price_month", semesterPriceId: "price_semester", accountId: ACCOUNT, ownerEmail: "owner@example.test" };
const fixture = () => ({
  accounts: { retrieve: async () => ({ id: ACCOUNT, country: "CA", capabilities: { alipay_payments: "pending" } }) },
  webhookEndpoints: { retrieve: async () => ({ livemode: true, status: "enabled", url: `${ORIGIN}/api/billing/alipay/webhook`, api_version: API_VERSION, enabled_events: EVENTS }) },
  prices: { retrieve: async (id) => ({ livemode: true, active: true, type: "one_time", currency: "cad", unit_amount: id === "price_month" ? 1999 : 6999, tax_behavior: "exclusive", product: { active: true, tax_code: "txcd_10105001" } }) },
  tax: { settings: { retrieve: async () => ({ status: "active" }) } }
});
test("private Alipay installer pins the intended account and webhook, preserves drafts and never opens checkout", async () => {
  const values = await prepare(payload, fixture(), { findUserByEmail: async () => ({ id: "owner-id" }) });
  assert.equal(values.ALIPAY_CHECKOUT_ACCESS, "closed"); assert.equal(values.ALIPAY_PRICES_APPROVED, "false"); assert.equal(values.ALIPAY_TERMS_VERSION, "");
  assert.equal(values.ALIPAY_OWNER_USER_ID, "owner-id"); assert.equal(values.STRIPE_ALIPAY_ACCOUNT_ID, ACCOUNT);
  assert.equal((await prepare({ ...payload, secretKey: "rk_live_fixture" }, fixture(), { findUserByEmail: async () => ({ id: "owner-id" }) })).STRIPE_ALIPAY_SECRET_KEY, "rk_live_fixture");
  const original = "# keep\nSESSION_SECRET=existing\nALIPAY_CHECKOUT_ACCESS=public\nUNRELATED='kept'\n";
  const rendered = renderEnv(original, values), parsed = parseEnv(rendered);
  assert.equal(parsed.SESSION_SECRET, "existing"); assert.equal(parsed.UNRELATED, "kept"); assert.equal(parsed.ALIPAY_CHECKOUT_ACCESS, "closed");
  assert.equal(rendered.match(/ALIPAY_CHECKOUT_ACCESS=/g).length, 1); assert.ok(rendered.startsWith("# keep\n"));
});
test("private Alipay installer rejects mismatched account, environment, webhook or final prices before updating configuration", async () => {
  for (const mutate of [
    (s) => { s.accounts.retrieve = async () => ({ id: "acct_wrong", country: "CA" }); },
    (s) => { s.webhookEndpoints.retrieve = async () => ({ livemode: true, status: "enabled", url: "https://other.example/hook" }); },
    (s) => { s.prices.retrieve = async () => ({ livemode: true, active: true, unit_amount: 1 }); },
    (s) => { s.tax.settings.retrieve = async () => ({ status: "pending" }); }
  ]) { const provider = fixture(); mutate(provider); await assert.rejects(prepare(payload, provider, { findUserByEmail: async () => ({ id: "owner" }) })); }
  await assert.rejects(prepare({ ...payload, secretKey: "sk_test_wrong" }, fixture(), {}));
});
