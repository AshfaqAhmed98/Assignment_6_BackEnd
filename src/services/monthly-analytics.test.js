import assert from "node:assert/strict";
import test from "node:test";
import {
  fillMonthlyAnalytics,
  getUtcMonthWindow,
} from "./monthly-analytics.js";

test("builds a rolling UTC month window across year boundaries", () => {
  const result = getUtcMonthWindow(new Date("2026-01-15T12:00:00.000Z"), 3);

  assert.deepEqual(result.months, ["2025-11", "2025-12", "2026-01"]);
  assert.equal(result.startDate.toISOString(), "2025-11-01T00:00:00.000Z");
});

test("fills missing analytics months with zero values", () => {
  const series = fillMonthlyAnalytics(
    [{ _id: "2026-01", amountMinor: 12500 }],
    "amountMinor",
    new Date("2026-01-15T12:00:00.000Z"),
  );

  assert.equal(series.length, 12);
  assert.deepEqual(series.slice(-2), [
    { month: "2025-12", amountMinor: 0 },
    { month: "2026-01", amountMinor: 12500 },
  ]);
});
