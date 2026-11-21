import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewInput } from "./reviews.routes.js";

test("parses a completed booking review and trims its comment", () => {
  assert.deepEqual(
    parseReviewInput({
      bookingId: "507f1f77bcf86cd799439011",
      rating: 5,
      comment: "  Excellent equipment.  ",
    }),
    {
      bookingId: "507f1f77bcf86cd799439011",
      rating: 5,
      comment: "Excellent equipment.",
    },
  );
});

test("rejects invalid booking IDs, ratings, and comments", () => {
  for (const body of [
    { bookingId: "invalid", rating: 5, comment: "Good" },
    {
      bookingId: "507f1f77bcf86cd799439011",
      rating: 0,
      comment: "Good",
    },
    {
      bookingId: "507f1f77bcf86cd799439011",
      rating: 6,
      comment: "Good",
    },
    {
      bookingId: "507f1f77bcf86cd799439011",
      rating: 4.5,
      comment: "Good",
    },
    {
      bookingId: "507f1f77bcf86cd799439011",
      rating: 4,
      comment: " ",
    },
    {
      bookingId: "507f1f77bcf86cd799439011",
      rating: 4,
      comment: "x".repeat(1201),
    },
  ]) {
    assert.equal(parseReviewInput(body), null);
  }
});
