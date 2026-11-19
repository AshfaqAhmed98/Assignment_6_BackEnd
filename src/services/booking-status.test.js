import assert from "node:assert/strict";
import test from "node:test";
import { getBookingStatus } from "./booking-status.js";

const today = new Date("2026-11-19T12:00:00.000Z");

test("marks bookings ending today as completed because the return date is exclusive", () => {
  assert.equal(
    getBookingStatus(
      new Date("2026-11-17T00:00:00.000Z"),
      new Date("2026-11-19T00:00:00.000Z"),
      today,
    ),
    "completed",
  );
});

test("marks bookings that include today as ongoing", () => {
  assert.equal(
    getBookingStatus(
      new Date("2026-11-19T00:00:00.000Z"),
      new Date("2026-11-21T00:00:00.000Z"),
      today,
    ),
    "ongoing",
  );
});

test("marks bookings starting after today as upcoming", () => {
  assert.equal(
    getBookingStatus(
      new Date("2026-11-20T00:00:00.000Z"),
      new Date("2026-11-21T00:00:00.000Z"),
      today,
    ),
    "upcoming",
  );
});
