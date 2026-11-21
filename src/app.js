import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { toNodeHandler } from "better-auth/node";
import { createEquipmentRouter } from "./routes/equipment.routes.js";
import { createBookingsRouter } from "./routes/bookings.routes.js";
import { createFavoritesRouter } from "./routes/favorites.routes.js";
import {
  createPaymentsRouter,
  createStripeWebhookHandler,
} from "./routes/payments.routes.js";
import { createUploadsRouter } from "./routes/profile-photo.routes.js";
import { createAdminRouter } from "./routes/admin.routes.js";
import { createReviewsRouter } from "./routes/reviews.routes.js";
import { createContactRouter } from "./routes/contact.routes.js";
import { createStripeClient } from "./services/stripe-client.js";

export function createApp(auth, stripe = createStripeClient()) {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    }),
  );

  if (auth) {
    app.all("/api/auth/*splat", toNodeHandler(auth));
  } else {
    app.all("/api/auth/*splat", (_request, response) => {
      response.status(503).json({
        message: "Authentication is temporarily unavailable.",
      });
    });
  }

  app.post(
    "/api/payments/stripe/webhook",
    express.raw({ type: "application/json" }),
    createStripeWebhookHandler(stripe),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (_request, response) => {
    response.json({
      name: "GearRent API",
      status: "running",
    });
  });

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  app.use("/api/equipment", createEquipmentRouter(auth));
  app.use("/api/contact", createContactRouter());
  app.use("/api/reviews", createReviewsRouter(auth));
  app.use("/api/favorites", createFavoritesRouter(auth));
  app.use("/api/bookings", createBookingsRouter(auth, stripe));
  app.use("/api/payments", createPaymentsRouter(auth));
  app.use("/api/uploads", createUploadsRouter(auth));
  app.use("/api/admin", createAdminRouter(auth, stripe));

  app.use((_request, response) => {
    response.status(404).json({
      message: "Route not found",
    });
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({
      message: "Internal server error",
    });
  });

  return app;
}
