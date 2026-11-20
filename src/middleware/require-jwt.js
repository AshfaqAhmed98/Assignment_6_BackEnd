import mongoose from "mongoose";
import { isAccountStatusActive } from "../services/account-status.js";

function rejectUnauthorized(response, message) {
  response.set("WWW-Authenticate", "Bearer");
  return response.status(401).json({ message });
}

export function requireJwt(
  auth,
  {
    getCurrentUser = (userId) =>
      mongoose.connection
        .getClient()
        .db()
        .collection("user")
        .findOne(
          { _id: new mongoose.Types.ObjectId(userId) },
          {
            projection: {
              role: 1,
              name: 1,
              email: 1,
              accountStatus: 1,
            },
          },
        ),
    isConnected = () => mongoose.connection.readyState === 1,
  } = {},
) {
  if (typeof auth?.api?.verifyJWT !== "function") {
    return (_request, response) =>
      response.status(503).json({
        message: "Authentication is temporarily unavailable.",
      });
  }

  return async (request, response, next) => {
    const authorization = request.get("authorization");
    const bearerToken =
      typeof authorization === "string"
        ? /^Bearer ([^\s]+)$/i.exec(authorization)?.[1]
        : undefined;

    if (!bearerToken) {
      return rejectUnauthorized(
        response,
        "A Bearer access token is required.",
      );
    }

    try {
      const { payload } = await auth.api.verifyJWT({
        body: { token: bearerToken },
      });

      if (!payload || typeof payload.sub !== "string") {
        return rejectUnauthorized(
          response,
          "The access token is invalid or expired.",
        );
      }
      if (!mongoose.isValidObjectId(payload.sub)) {
        return rejectUnauthorized(
          response,
          "The access token is invalid or expired.",
        );
      }
      if (!isConnected()) {
        return response.status(503).json({
          message: "Authentication is temporarily unavailable.",
        });
      }

      const currentUser = await getCurrentUser(payload.sub);
      if (!currentUser) {
        return rejectUnauthorized(
          response,
          "The access token is invalid or expired.",
        );
      }
      if (!isAccountStatusActive(currentUser.accountStatus)) {
        return rejectUnauthorized(
          response,
          "This account is suspended or deleted.",
        );
      }

      request.auth = {
        userId: payload.sub,
        role:
          typeof currentUser.role === "string"
            ? currentUser.role
            : "Customer",
        ...(typeof currentUser.name === "string"
          ? { name: currentUser.name }
          : {}),
        ...(typeof currentUser.email === "string"
          ? { email: currentUser.email }
          : {}),
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
