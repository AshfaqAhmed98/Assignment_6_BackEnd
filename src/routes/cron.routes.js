import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { runBookingCompletionJob } from "../services/booking-completion-job.js";
import { createBookingCompletionMailer } from "../services/booking-completion-email.js";

function hasValidAuthorization(header, secret) {
  if (typeof header !== "string" || !secret) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export function createBookingCompletionCronRouter({
  secret = process.env.CRON_SECRET,
  mailer = createBookingCompletionMailer(),
  runJob = runBookingCompletionJob,
  logger = console,
} = {}) {
  const router = Router();

  router.post("/bookings/completion", async (request, response) => {
    if (typeof secret !== "string" || secret.length < 16) {
      return response.status(503).json({
        message: "Scheduled booking updates are not configured.",
      });
    }

    if (!hasValidAuthorization(request.get("authorization"), secret)) {
      return response.status(401).json({ message: "Unauthorized." });
    }

    const result = await runJob({ mailer, logger });
    return response.json({ status: "ok", ...result });
  });

  return router;
}
