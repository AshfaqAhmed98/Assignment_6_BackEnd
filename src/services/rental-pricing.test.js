import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRentalPrice,
  countAvailableQuantity,
  parseRentalDateRange,
} from "./rental-pricing.js";

test("counts elapsed rental dates and bills at least one day", () => {
  const sameDay = parseRentalDateRange("2026-11-19", "2026-11-19");
  assert.equal(sameDay.durationDays, 1);
  assert.equal(sameDay.endDate.toISOString(), "2026-11-20T00:00:00.000Z");

  const range = parseRentalDateRange("2026-11-19", "2026-11-22");
  assert.equal(range.durationDays, 3);
});

test("rejects invalid and reversed rental dates", () => {
  assert.throws(
    () => parseRentalDateRange("2026-02-30", "2026-03-01"),
    /valid rental start and end dates/,
  );
  assert.throws(
    () => parseRentalDateRange("2026-11-20", "2026-11-19"),
    /end date must be on or after/,
  );
});

test("rounds weekly and monthly rentals up to whole periods", () => {
  assert.deepEqual(
    calculateRentalPrice({
      dailyRate: 100,
      rentalType: "weekly",
      durationDays: 8,
      quantity: 2,
    }),
    {
      billedUnits: 2,
      periodDays: 7,
      unitAmountMinor: 70000,
      amountMinor: 280000,
      totalAmount: 2800,
    },
  );
  assert.equal(
    calculateRentalPrice({
      dailyRate: 100,
      rentalType: "monthly",
      durationDays: 31,
      quantity: 1,
    }).amountMinor,
    600000,
  );
});

test("subtracts overlapping reservations from total equipment quantity", () => {
  assert.equal(countAvailableQuantity(5, [1, 2]), 2);
  assert.equal(countAvailableQuantity(1, [1, 1]), 0);
});
