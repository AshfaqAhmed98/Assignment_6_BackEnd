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
    }, {
      getCurrentUser: async () => ({ role: "Customer" }),
      isConnected: () => true,
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
            payload: {
              sub: "507f1f77bcf86cd799439011",
              role: "Customer",
              name: "Renter One",
              email: "renter@example.com",
            },
          };
        },
      },
    }, {
      getCurrentUser: async () => ({
        role: "Customer",
        name: "Renter One",
        email: "renter@example.com",
      }),
      isConnected: () => true,
    }),
    "Bearer valid.token.value",
  );

  assert.equal(verifiedToken, "valid.token.value");
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.request.auth, {
    userId: "507f1f77bcf86cd799439011",
    role: "Customer",
    name: "Renter One",
    email: "renter@example.com",
  });
});

test("uses the current database role instead of a stale JWT role", async () => {
  const result = await invokeMiddleware(
    requireJwt(
      {
        api: {
          async verifyJWT() {
            return {
              payload: {
                sub: "507f1f77bcf86cd799439011",
                role: "Admin",
                name: "Old name",
              },
            };
          },
        },
      },
      {
        getCurrentUser: async () => ({
          role: "Customer",
          name: "Current name",
          email: "current@example.com",
        }),
        isConnected: () => true,
      },
    ),
    "Bearer valid.token.value",
  );

  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.request.auth, {
    userId: "507f1f77bcf86cd799439011",
    role: "Customer",
    name: "Current name",
    email: "current@example.com",
  });
});

test("rejects a token after its account has been removed", async () => {
  const result = await invokeMiddleware(
    requireJwt(
      {
        api: {
          async verifyJWT() {
            return {
              payload: { sub: "507f1f77bcf86cd799439011" },
            };
          },
        },
      },
      {
        getCurrentUser: async () => null,
        isConnected: () => true,
      },
    ),
    "Bearer valid.token.value",
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("rejects tokens for suspended and deleted accounts", async () => {
  for (const accountStatus of ["suspended", "deleted"]) {
    const result = await invokeMiddleware(
      requireJwt(
        {
          api: {
            async verifyJWT() {
              return {
                payload: { sub: "507f1f77bcf86cd799439011" },
              };
            },
          },
        },
        {
          getCurrentUser: async () => ({
            role: "Customer",
            accountStatus,
          }),
          isConnected: () => true,
        },
      ),
      "Bearer valid.token.value",
    );

    assert.equal(result.response.statusCode, 401);
    assert.equal(result.nextCalled, false);
  }
});

test("returns service unavailable when role lookup cannot reach the database", async () => {
  const result = await invokeMiddleware(
    requireJwt(
      {
        api: {
          async verifyJWT() {
            return {
              payload: { sub: "507f1f77bcf86cd799439011" },
            };
          },
        },
      },
      {
        getCurrentUser: async () => null,
        isConnected: () => false,
      },
    ),
    "Bearer valid.token.value",
  );

  assert.equal(result.response.statusCode, 503);
  assert.equal(result.nextCalled, false);
});

test("returns service unavailable when auth is not initialized", async () => {
  const result = await invokeMiddleware(requireJwt(null), "Bearer any.token");

  assert.equal(result.response.statusCode, 503);
  assert.equal(result.response.body.message, "Authentication is temporarily unavailable.");
});
