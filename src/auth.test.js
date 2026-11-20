import assert from "node:assert/strict";
import test from "node:test";
import {
  getProfileInputError,
  isAccountSignInAllowed,
  isRoleInputAllowed,
} from "./auth.js";

test("allows active and legacy accounts to sign in, but blocks inactive accounts", () => {
  assert.equal(isAccountSignInAllowed({ accountStatus: "active" }), true);
  assert.equal(isAccountSignInAllowed({}), true);
  assert.equal(isAccountSignInAllowed({ accountStatus: "suspended" }), false);
  assert.equal(isAccountSignInAllowed({ accountStatus: "deleted" }), false);
  assert.equal(isAccountSignInAllowed(null), false);
});

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

test("profile updates validate contact details and profile image URLs", () => {
  assert.equal(
    getProfileInputError({
      name: "Alex Rider",
      phoneNumber: "+880 1712-345678",
      address: "Dhaka",
      image: "https://images.example.com/profile.jpg",
    }),
    null,
  );
  assert.equal(getProfileInputError({ phoneNumber: "not a phone" }), "Enter a valid phone number.");
  assert.equal(getProfileInputError({ address: "a".repeat(501) }), "Address must be 500 characters or fewer.");
  assert.equal(getProfileInputError({ image: "javascript:alert(1)" }), "Profile photo URL must use HTTP or HTTPS.");
  assert.equal(getProfileInputError({ name: " " }), "Enter a name between 1 and 80 characters.");
});
