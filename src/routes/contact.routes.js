import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import { createBookingCompletionMailer } from "../services/booking-completion-email.js";

const contactTopics = new Set([
  "Booking support",
  "Equipment listing",
  "Account help",
  "Other",
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many messages. Please try again later." },
});

export function parseContactInput(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const { name, email, topic, message } = body;
  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 80 ||
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !emailPattern.test(email.trim()) ||
    typeof topic !== "string" ||
    !contactTopics.has(topic) ||
    typeof message !== "string" ||
    message.trim().length < 10 ||
    message.trim().length > 2000
  ) {
    return null;
  }

  return {
    name: name.trim(),
    email: email.trim(),
    topic,
    message: message.trim(),
  };
}

export function createContactRouter({
  contactEmail = process.env.CONTACT_EMAIL,
  mailer = createBookingCompletionMailer(),
} = {}) {
  const router = Router();

  router.post("/", contactRateLimit, async (request, response) => {
    const input = parseContactInput(request.body);
    if (!input) {
      return response.status(400).json({
        message:
          "Provide your name, a valid email address, a topic, and a message between 10 and 2000 characters.",
      });
    }

    const recipient =
      typeof contactEmail === "string" ? contactEmail.trim() : "";
    if (!emailPattern.test(recipient) || !mailer.isConfigured) {
      return response.status(503).json({
        message:
          "The contact form is temporarily unavailable. Please email ashkcm98@gmail.com or call +880 1866 206500.",
      });
    }

    await mailer.sendMail({
      to: recipient,
      replyTo: input.email,
      subject: `New GearRent contact request: ${input.topic}`,
      text: [
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        `Topic: ${input.topic}`,
        "",
        "Message:",
        input.message,
      ].join("\n"),
    });

    return response.status(202).json({
      message: "Your message has been sent. Thanks for getting in touch.",
    });
  });

  return router;
}
