import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import {
  createContactRouter,
  parseContactInput,
} from "./contact.routes.js";

const validInput = {
  name: "Alex Morgan",
  email: "alex@example.test",
  topic: "Booking support",
  message: "I have a question about a recent equipment booking.",
};

async function withContactServer(options, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/contact", createContactRouter(options));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}/api/contact`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("parses contact messages and trims user-provided text", () => {
  assert.deepEqual(
    parseContactInput({
      ...validInput,
      name: " Alex Morgan ",
      email: " alex@example.test ",
      message: "  I need help with my booking.  ",
    }),
    {
      ...validInput,
      name: "Alex Morgan",
      email: "alex@example.test",
      message: "I need help with my booking.",
    },
  );
});

test("rejects malformed or oversized contact messages", () => {
  for (const body of [
    { ...validInput, email: "not-an-email" },
    { ...validInput, topic: "Send me a password reset" },
    { ...validInput, message: "short" },
    { ...validInput, message: "x".repeat(2001) },
  ]) {
    assert.equal(parseContactInput(body), null);
  }
});

test("sends a valid contact message to the configured mailbox", async () => {
  const sentMessages = [];
  await withContactServer(
    {
      contactEmail: "support@example.test",
      mailer: {
        isConfigured: true,
        async sendMail(message) {
          sentMessages.push(message);
        },
      },
    },
    async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validInput),
      });

      assert.equal(response.status, 202);
      assert.match((await response.json()).message, /sent/i);
    },
  );

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "support@example.test");
  assert.equal(sentMessages[0].replyTo, validInput.email);
  assert.match(sentMessages[0].text, /I have a question about a recent equipment booking/);
});

test("reports an unavailable contact form when SMTP is not configured", async () => {
  await withContactServer(
    {
      contactEmail: "support@example.test",
      mailer: {
        isConfigured: false,
        async sendMail() {
          assert.fail("Unconfigured mailer must not be called");
        },
      },
    },
    async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validInput),
      });

      assert.equal(response.status, 503);
      assert.match((await response.json()).message, /temporarily unavailable/i);
    },
  );
});
