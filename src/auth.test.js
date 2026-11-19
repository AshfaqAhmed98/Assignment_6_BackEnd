import assert from "node:assert/strict";
import test from "node:test";
import { isRoleInputAllowed } from "./auth.js";

test("public signup can select only Customer or Owner roles", () => {
  assert.equal(isRoleInputAllowed("/sign-up/email", undefined), true);
  assert.equal(isRoleInputAllowed("/sign-up/email", "Customer"), true);
  assert.equal(isRoleInputAllowed("/sign-up/email", "Owner"), true);
  assert.equal(isRoleInputAllowed("/sign-up/email", "Admin"), false);
  assert.equal(isRoleInputAllowed("/sign-up/email", "Unknown"), false);
});

test("profile updates cannot change an account role", () => {
  assert.equal(isRoleInputAllowed("/update-user", undefined), true);
  assert.equal(isRoleInputAllowed("/update-user", "Customer"), false);
  assert.equal(isRoleInputAllowed("/update-user", "Owner"), false);
  assert.equal(isRoleInputAllowed("/update-user", "Admin"), false);
});
