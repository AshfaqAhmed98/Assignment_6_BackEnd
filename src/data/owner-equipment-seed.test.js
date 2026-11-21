import assert from "node:assert/strict";
import test from "node:test";
import { parseEquipmentInput } from "../routes/equipment.routes.js";
import { ownerEquipmentSeed } from "./owner-equipment-seed.js";

test("provides 20 unique and valid owner equipment listings", () => {
  assert.equal(ownerEquipmentSeed.length, 20);
  assert.equal(
    new Set(ownerEquipmentSeed.map((listing) => listing.name)).size,
    20,
  );

  for (const listing of ownerEquipmentSeed) {
    const { approvalStatus, dailyRate, ...input } = listing;

    assert.equal(approvalStatus, "pending");
    assert.equal(
      parseEquipmentInput(input)?.dailyRate,
      dailyRate,
      `${listing.name} should satisfy equipment validation`,
    );
  }
});
