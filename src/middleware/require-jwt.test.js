import assert from "node:assert/strict";
import test from "node:test";
import { requireJwt } from "./require-jwt.js";

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invokeMiddleware(middleware, authorization) {
  const request = {
    auth: null,
    get(name) {
      return name === "authorization" ? authorization : undefined;
    },
  };
  const response = createResponse();
  let nextCalled = false;
  let nextError;

  await middleware(request, response, (error) => {
    nextCalled = true;
    nextError = error;
  });

  return { request, response, nextCalled, nextError };
}

test("requires a Bearer access token", async () => {
  let verifyCalled = false;
  const result = await invokeMiddleware(
    requireJwt({
      api: {
        async verifyJWT() {
          verifyCalled = true;
          return { payload: { sub: "user-1" } };
        },
      },
    }),
    undefined,
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.headers["www-authenticate"], "Bearer");
  assert.equal(verifyCalled, false);
});

test("rejects invalid or expired tokens", async () => {
  const result = await invokeMiddleware(
    requireJwt({
      api: {
        async verifyJWT() {
          return { payload: null };
        },
      },
    }),
    "Bearer invalid.token.value",
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("passes verified identity to the route", async () => {
  let verifiedToken;
  const result = await invokeMiddleware(
    requireJwt({
      api: {
        async verifyJWT({ body }) {
          verifiedToken = body.token;
          return {
            payload: { sub: "user-1", role: "Customer" },
          };
        },
      },
    }),
    "Bearer valid.token.value",
  );

  assert.equal(verifiedToken, "valid.token.value");
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.request.auth, {
    userId: "user-1",
    role: "Customer",
  });
});

test("returns service unavailable when auth is not initialized", async () => {
  const result = await invokeMiddleware(requireJwt(null), "Bearer any.token");

  assert.equal(result.response.statusCode, 503);
  assert.equal(result.response.body.message, "Authentication is temporarily unavailable.");
});
