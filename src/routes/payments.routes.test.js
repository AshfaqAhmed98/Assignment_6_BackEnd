import assert from "node:assert/strict";
import test from "node:test";
import { createStripeWebhookHandler } from "./payments.routes.js";

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rejects Stripe webhook requests with invalid signatures", async (t) => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  t.after(() => {
    if (originalSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
  });

  const stripe = {
    webhooks: {
      constructEvent(body, signature, secret) {
        assert.ok(Buffer.isBuffer(body));
        assert.equal(signature, "invalid");
        assert.equal(secret, "whsec_test");
        throw new Error("signature mismatch");
      },
    },
  };
  const response = createResponse();
  await createStripeWebhookHandler(stripe)(
    {
      body: Buffer.from("{}"),
      get: () => "invalid",
    },
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /signature verification failed/);
});

test("reports Stripe webhooks unavailable when server configuration is missing", async (t) => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  t.after(() => {
    if (originalSecret !== undefined) {
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
  });

  const response = createResponse();
  await createStripeWebhookHandler(null)({ body: Buffer.from("{}") }, response);

  assert.equal(response.statusCode, 503);
});
