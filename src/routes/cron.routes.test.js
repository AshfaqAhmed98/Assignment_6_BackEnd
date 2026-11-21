import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import { createBookingCompletionCronRouter } from "./cron.routes.js";

async function withCronServer(options, run) {
  const app = express();
  app.use("/api/cron", createBookingCompletionCronRouter(options));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}/api/cron/bookings/completion`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("rejects scheduled runs when the secret is not configured", async () => {
  await withCronServer(
    {
      secret: "",
      runJob: async () => assert.fail("Unconfigured cron must not run"),
    },
    async (url) => {
      const response = await fetch(url, { method: "POST" });

      assert.equal(response.status, 503);
    },
  );
});

test("rejects missing and incorrect cron authorization", async () => {
  await withCronServer(
    {
      secret: "a-secure-test-secret",
      runJob: async () => assert.fail("Unauthorized cron must not run"),
    },
    async (url) => {
      for (const authorization of [undefined, "Bearer wrong-secret"]) {
        const response = await fetch(url, {
          method: "POST",
          headers: authorization ? { authorization } : {},
        });

        assert.equal(response.status, 401);
      }
    },
  );
});

test("runs booking completion only with the configured Bearer secret", async () => {
  const calls = [];
  await withCronServer(
    {
      secret: "a-secure-test-secret",
      mailer: { isConfigured: false },
      runJob: async (options) => {
        calls.push(options);
        return { completedStatusesUpdated: true, notificationsAttempted: 0 };
      },
    },
    async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: "Bearer a-secure-test-secret" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        status: "ok",
        completedStatusesUpdated: true,
        notificationsAttempted: 0,
      });
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].mailer.isConfigured, false);
});
