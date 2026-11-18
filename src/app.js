import cors from "cors";
import express from "express";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    }),
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
    });
  });

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
