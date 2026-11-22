import assert from "node:assert/strict";
import test from "node:test";
import {
  approveAllPendingEquipment,
  parseEquipmentInput,
} from "./equipment.routes.js";

const equipmentInput = {
  name: "Jobsite generator",
  category: "Power",
  location: "Dhaka",
  rentalPrice: 1000,
  rentalType: "weekly",
  quantity: 2,
  image: "https://images.example.com/generator.jpg",
  description: "Portable generator for a worksite.",
  condition: "Good",
  brand: "GearRent",
  model: "GR-100",
  rentalTerms: "Return with a full fuel tank.",
};

test("normalizes the selected equipment rental rate for the booking engine", () => {
  assert.deepEqual(parseEquipmentInput(equipmentInput), {
    ...equipmentInput,
    rentalPrice: 1000,
    rentalType: "weekly",
    dailyRate: 142.86,
  });
});

test("keeps legacy daily-rate equipment requests valid", () => {
  const input = {
    name: "Legacy listing",
    category: "Power",
    location: "Dhaka",
    dailyRate: 100,
    image: "https://images.example.com/equipment.jpg",
    description: "An existing API client.",
  };

  assert.deepEqual(parseEquipmentInput(input), {
    ...input,
    rentalPrice: 100,
    rentalType: "daily",
    dailyRate: 100,
  });
});

test("allows valid quantity changes in partial equipment updates", () => {
  assert.deepEqual(
    parseEquipmentInput({ quantity: 12 }, { partial: true }),
    { quantity: 12 },
  );
  assert.equal(
    parseEquipmentInput({ quantity: 0 }, { partial: true }),
    null,
  );
  assert.equal(
    parseEquipmentInput({ quantity: 10001 }, { partial: true }),
    null,
  );
});

test("rejects mismatched pricing fields and owner-controlled status data", () => {
  assert.equal(
    parseEquipmentInput({
      ...equipmentInput,
      rentalType: undefined,
    }),
    null,
  );
  assert.equal(
    parseEquipmentInput({
      ...equipmentInput,
      approvalStatus: "approved",
    }),
    null,
  );
  assert.equal(
    parseEquipmentInput({
      ...equipmentInput,
      condition: "Unknown",
    }),
    null,
  );
});

test("bulk approval changes only pending listings and returns the modified count", async () => {
  let update;
  const approvedCount = await approveAllPendingEquipment({
    async updateMany(filter, changes) {
      update = { filter, changes };
      return { modifiedCount: 20 };
    },
  });

  assert.deepEqual(update, {
    filter: { approvalStatus: "pending" },
    changes: { $set: { approvalStatus: "approved" } },
  });
  assert.equal(approvedCount, 20);
});

test("bulk approval reports zero when there are no pending listings", async () => {
  const approvedCount = await approveAllPendingEquipment({
    async updateMany(filter) {
      assert.deepEqual(filter, { approvalStatus: "pending" });
      return { modifiedCount: 0 };
    },
  });

  assert.equal(approvedCount, 0);
});
