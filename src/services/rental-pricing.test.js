import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRentalPrice,
  countAvailableQuantity,
  getDhakaStartOfDay,
  parseRentalDateRange,
} from "./rental-pricing.js";

test("uses Bangladesh local date for equipment available today", () => {
  assert.equal(
    getDhakaStartOfDay(new Date("2026-11-22T22:30:00.000Z")).toISOString(),
    "2026-11-23T00:00:00.000Z",
  );
  assert.equal(
    getDhakaStartOfDay(new Date("2026-11-22T17:59:59.999Z")).toISOString(),
    "2026-11-22T00:00:00.000Z",
  );
});

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

test("uses the owner's exact selected-period price and derives other rates", () => {
  assert.equal(
    calculateRentalPrice({
      dailyRate: 142.86,
      rentalType: "weekly",
      durationDays: 7,
      quantity: 1,
      rentalPrice: 1000,
      equipmentRentalType: "weekly",
    }).amountMinor,
    100000,
  );
  assert.equal(
    calculateRentalPrice({
      dailyRate: 142.86,
      rentalType: "daily",
      durationDays: 1,
      quantity: 1,
      rentalPrice: 1000,
      equipmentRentalType: "weekly",
    }).amountMinor,
    14286,
  );
});

test("subtracts overlapping reservations from total equipment quantity", () => {
  assert.equal(countAvailableQuantity(5, [1, 2]), 2);
  assert.equal(countAvailableQuantity(1, [1, 1]), 0);
});
