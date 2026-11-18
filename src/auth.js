import { dash } from "@better-auth/infra";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import mongoose from "mongoose";

const validateSignUp = createAuthMiddleware(async (context) => {
  if (context.path !== "/sign-up/email") {
    return;
  }

  const { name, password, image } = context.body ?? {};

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 80
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "Enter a name between 1 and 80 characters.",
    });
  }

  if (
    typeof password === "string" &&
    (!/[A-Z]/.test(password) || !/[a-z]/.test(password))
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "Password must include an uppercase and a lowercase letter.",
    });
  }

  if (
    typeof image !== "string" ||
    image.trim().length === 0 ||
    image.length > 2048
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "Enter a valid profile photo URL.",
    });
  }

  let photoUrl;
  try {
    photoUrl = new URL(image.trim());
  } catch {
    throw new APIError("BAD_REQUEST", {
      message: "Enter a valid profile photo URL.",
    });
  }

  if (!["http:", "https:"].includes(photoUrl.protocol)) {
    throw new APIError("BAD_REQUEST", {
      message: "Profile photo URL must use HTTP or HTTPS.",
    });
  }
});

export function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const infraApiKey = process.env.BETTER_AUTH_API_KEY?.trim();

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters.");
  }

  if (!infraApiKey) {
    throw new Error("BETTER_AUTH_API_KEY must be set to enable Better Auth Dash.");
  }

  const client = mongoose.connection.getClient();
  const database = client.db();

  return betterAuth({
    database: mongodbAdapter(database, { client, transaction: false }),
    secret,
    baseURL:
      process.env.BETTER_AUTH_URL ||
      `http://localhost:${process.env.PORT || 5000}`,
    trustedOrigins: [process.env.FRONTEND_URL || "http://localhost:3000"],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 6,
      maxPasswordLength: 128,
    },
    plugins: [dash({ apiKey: infraApiKey })],
    hooks: {
      before: validateSignUp,
    },
  });
}
