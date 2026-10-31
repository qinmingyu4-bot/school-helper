"use strict";
if (process.env.NODE_ENV !== "test") throw new Error("Billing fixture is test-only.");
const path = require.resolve("stripe"), Stripe = require(path);
const { billingStripeFixture } = require("../helpers/billing-stripe");
const fixture = billingStripeFixture(), verify = fixture.stripe.webhooks.constructEvent.bind(fixture.stripe.webhooks);
fixture.stripe.webhooks = { constructEvent(...args) {
  const event = verify(...args), object = event.data?.object;
  if (event.livemode === false && object?.object === "subscription") fixture.subscriptions.set(object.id, structuredClone(object));
  return event;
} };
function FixtureStripe() { return fixture.stripe; }
FixtureStripe.webhooks = Stripe.webhooks;
require.cache[path].exports = FixtureStripe;
