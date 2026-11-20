import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAccountStatusUpdate,
  parseAdminUserQuery,
  parseUserRoleUpdate,
} from "./admin.routes.js";

test("parses bounded admin user pagination and safely escapes search", () => {
  assert.deepEqual(parseAdminUserQuery({ search: "a.*b", limit: "25", offset: "50" }), {
    limit: 25,
    offset: 50,
    filter: {
      $or: [
        { name: /a\.\*b/i },
        { email: /a\.\*b/i },
      ],
    },
  });
  assert.equal(parseAdminUserQuery({ limit: "101" }), null);
  assert.equal(parseAdminUserQuery({ role: "Superuser" }), null);
  assert.deepEqual(parseAdminUserQuery({ status: "active" }), {
    limit: 50,
    offset: 0,
    filter: {
      $or: [
        { accountStatus: "active" },
        { accountStatus: { $exists: false } },
      ],
    },
  });
  assert.equal(parseAdminUserQuery({ status: "banned" }), null);
});

test("accepts only the platform's supported user roles", () => {
  assert.equal(parseUserRoleUpdate({ role: "Owner" }), "Owner");
  assert.equal(parseUserRoleUpdate({ role: "Superuser" }), null);
  assert.equal(parseUserRoleUpdate({ role: "Admin", extra: true }), null);
  assert.equal(parseUserRoleUpdate(null), null);
});

test("accepts only supported account status updates", () => {
  assert.equal(
    parseAccountStatusUpdate({ accountStatus: "suspended" }),
    "suspended",
  );
  assert.equal(parseAccountStatusUpdate({ accountStatus: "deleted" }), "deleted");
  assert.equal(parseAccountStatusUpdate({ accountStatus: "banned" }), null);
  assert.equal(
    parseAccountStatusUpdate({ accountStatus: "active", extra: true }),
    null,
  );
});
