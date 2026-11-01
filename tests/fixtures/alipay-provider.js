"use strict";
if (process.env.NODE_ENV !== "test") throw Error("Alipay fixture is test-only.");
const sdkPath = require.resolve("stripe"), Stripe = require(sdkPath);
const { billingStripeFixture } = require("../helpers/billing-stripe");
const fixture = billingStripeFixture({ livemode: true, automaticTax: true });
const verify = fixture.stripe.webhooks.constructEvent.bind(fixture.stripe.webhooks);
fixture.stripe.webhooks = { constructEvent(...args) {
  const event = verify(...args), object = event.data?.object;
  if (event.livemode === true && object?.object === "checkout.session" && fixture.sessions.has(object.id) && object.payment_status === "paid") fixture.pay(object.id, "alipay");
  if (event.livemode === true && object?.object === "refund") fixture.refunds.set(object.id, structuredClone(object));
  return event;
} };
function FixtureStripe() { return fixture.stripe; }
FixtureStripe.webhooks = Stripe.webhooks; FixtureStripe.API_VERSION = Stripe.API_VERSION;
require.cache[sdkPath].exports = FixtureStripe;
