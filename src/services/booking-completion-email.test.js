import assert from "node:assert/strict";
import test from "node:test";
import {
  createBookingCompletionEmail,
  createBookingCompletionMailer,
  isSmtpConfigured,
} from "./booking-completion-email.js";

const smtpEnvironment = {
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "465",
  SMTP_USER: "gearrent",
  SMTP_PASSWORD: "test-password",
  SMTP_FROM: "GearRent <notifications@example.test>",
};

test("requires SMTP configuration and sends from the configured address", async () => {
  assert.equal(isSmtpConfigured(smtpEnvironment), true);
  assert.equal(isSmtpConfigured({}), false);

  let transportOptions;
  const sentMessages = [];
  const mailer = createBookingCompletionMailer(
    smtpEnvironment,
    (options) => {
      transportOptions = options;
      return {
        async sendMail(message) {
          sentMessages.push(message);
        },
      };
    },
  );

  await mailer.sendMail({
    to: "renter@example.test",
    subject: "Rental complete",
    text: "Your rental is complete.",
  });

  assert.equal(mailer.isConfigured, true);
  assert.equal(transportOptions.secure, true);
  assert.equal(sentMessages[0].from, smtpEnvironment.SMTP_FROM);
  assert.equal(sentMessages[0].to, "renter@example.test");
});

test("creates separate role-aware completion email copy", () => {
  const message = createBookingCompletionEmail({
    recipientName: "Renter",
    equipmentName: "Generator",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-03T00:00:00.000Z"),
    recipientRole: "renter",
  });

  assert.match(message.subject, /rental is complete/i);
  assert.match(message.text, /Hello Renter/);
  assert.match(message.text, /Generator/);
  assert.match(message.text, /2026-04-01 to 2026-04-03/);
});
