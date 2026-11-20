import assert from "node:assert/strict";
import test from "node:test";
import { isStripeCheckoutConfigured } from "./stripe-client.js";

test("Stripe Checkout requires both a client and webhook signing secret", () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(isStripeCheckoutConfigured({}), false);
    assert.equal(isStripeCheckoutConfigured(null), false);

    process.env.STRIPE_WEBHOOK_SECRET = " whsec_test ";
    assert.equal(isStripeCheckoutConfigured({}), true);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
  }
});
