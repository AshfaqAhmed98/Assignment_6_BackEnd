import assert from "node:assert/strict";
import test from "node:test";
import { requirePermission } from "./permissions.js";

function invokePermission(permission, role) {
  const response = {
    statusCode: 0,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  requirePermission(permission)(
    { auth: role ? { userId: "user-1", role } : null },
    response,
    () => {
      nextCalled = true;
    },
  );

  return { response, nextCalled };
}

test("allows only owners and admins to create equipment", () => {
  assert.equal(invokePermission("equipment:create", "Owner").nextCalled, true);
  assert.equal(invokePermission("equipment:create", "Admin").nextCalled, true);

  const customer = invokePermission("equipment:create", "Customer");
  assert.equal(customer.response.statusCode, 403);
  assert.equal(customer.nextCalled, false);
});

test("allows only admins to approve equipment", () => {
  assert.equal(invokePermission("equipment:approve", "Admin").nextCalled, true);

  const owner = invokePermission("equipment:approve", "Owner");
  assert.equal(owner.response.statusCode, 403);
  assert.equal(owner.nextCalled, false);
});

test("allows each defined role to read approved equipment", () => {
  for (const role of ["Customer", "Owner", "Admin"]) {
    assert.equal(invokePermission("equipment:read", role).nextCalled, true);
  }
});

test("denies missing and unknown roles", () => {
  assert.equal(invokePermission("equipment:read", undefined).response.statusCode, 403);
  assert.equal(invokePermission("equipment:read", "Superuser").response.statusCode, 403);
});

test("rejects unknown permissions during route setup", () => {
  assert.throws(() => requirePermission("equipment:unknown"), /Unknown permission/);
});
