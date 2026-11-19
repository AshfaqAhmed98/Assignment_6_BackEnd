function rejectUnauthorized(response, message) {
  response.set("WWW-Authenticate", "Bearer");
  return response.status(401).json({ message });
}

export function requireJwt(auth) {
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

      request.auth = {
        userId: payload.sub,
        role: typeof payload.role === "string" ? payload.role : undefined,
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
