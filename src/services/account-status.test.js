import assert from "node:assert/strict";
import test from "node:test";
import {
  isAccountStatusActive,
  normalizeAccountStatus,
} from "./account-status.js";

test("treats legacy accounts as active and normalizes supported account states", () => {
  assert.equal(normalizeAccountStatus(undefined), "active");
  assert.equal(normalizeAccountStatus("active"), "active");
  assert.equal(normalizeAccountStatus("suspended"), "suspended");
  assert.equal(normalizeAccountStatus("deleted"), "deleted");
  assert.equal(normalizeAccountStatus("unknown"), "deleted");
});

test("only active or legacy accounts are eligible for access", () => {
  assert.equal(isAccountStatusActive(undefined), true);
  assert.equal(isAccountStatusActive("active"), true);
  assert.equal(isAccountStatusActive("suspended"), false);
  assert.equal(isAccountStatusActive("deleted"), false);
  assert.equal(isAccountStatusActive("unknown"), false);
});
