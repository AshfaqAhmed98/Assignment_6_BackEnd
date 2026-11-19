import { dash } from "@better-auth/infra";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import mongoose from "mongoose";

export function isRoleInputAllowed(path, role) {
  if (path === "/sign-up/email") {
    return role === undefined || role === "Customer" || role === "Owner";
  }

  if (path === "/update-user") {
    return role === undefined;
  }

  return true;
}

const validateAuthUserInput = createAuthMiddleware(async (context) => {
  const role = context.body?.role;
  if (!isRoleInputAllowed(context.path, role)) {
    throw new APIError("BAD_REQUEST", {
      message:
        context.path === "/update-user"
          ? "Account roles cannot be changed through profile updates."
          : "Choose either a Customer or Owner account. Admin access is assigned by an administrator.",
    });
  }

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

  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set to enable Google sign-in.",
    );
  }

  const baseURL =
    process.env.BETTER_AUTH_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  const secureCookies = new URL(baseURL).protocol === "https:";
  const client = mongoose.connection.getClient();
  const database = client.db();

  return betterAuth({
    database: mongodbAdapter(database, { client, transaction: false }),
    secret,
    baseURL,
    trustedOrigins: [process.env.FRONTEND_URL || "http://localhost:3000"],
    advanced: {
      defaultCookieAttributes: {
        sameSite: secureCookies ? "none" : "lax",
        secure: secureCookies,
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "Customer",
          input: true,
        },
      },
    },
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : undefined,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 6,
      maxPasswordLength: 128,
    },
    plugins: [
      dash({ apiKey: infraApiKey }),
      jwt({
        jwt: {
          issuer: baseURL,
          audience: "gearrent-api",
          expirationTime: "15m",
          definePayload: ({ user }) => ({
            role: user.role ?? "Customer",
            name: user.name,
          }),
        },
      }),
    ],
    hooks: {
      before: validateAuthUserInput,
    },
  });
}
