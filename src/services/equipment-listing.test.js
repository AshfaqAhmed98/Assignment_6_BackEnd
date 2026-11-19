import assert from "node:assert/strict";
import test from "node:test";
import {
  createEquipmentListing,
  parseEquipmentListingQuery,
} from "./equipment-listing.js";
import { calculateAvailableQuantities } from "./equipment-availability.js";

function equipmentItem(id, overrides = {}) {
  return {
    _id: { toString: () => id },
    name: `Equipment ${id}`,
    category: "Power Tools",
    location: "Dhaka",
    dailyRate: 100,
    quantity: 2,
    image: "/equipment.jpg",
    description: "Test equipment",
    createdAt: new Date(`2026-01-0${id}T00:00:00.000Z`),
    ...overrides,
  };
}

test("parses listing filters and rejects invalid price ranges", () => {
  assert.deepEqual(
    parseEquipmentListingQuery({
      search: " drill ",
      rentalType: "weekly",
      minPrice: "500",
      maxPrice: "900",
      availability: "available",
      sort: "price-low-to-high",
    }),
    {
      search: "drill",
      category: "",
      rentalType: "weekly",
      minPrice: 500,
      maxPrice: 900,
      availability: "available",
      sort: "price-low-to-high",
    },
  );
  assert.throws(
    () => parseEquipmentListingQuery({ minPrice: "900", maxPrice: "500" }),
    /Minimum price cannot exceed maximum price/,
  );
  assert.throws(
    () => parseEquipmentListingQuery({ rentalType: "yearly" }),
    /Rental type must be daily, weekly, or monthly/,
  );
  assert.throws(
    () => parseEquipmentListingQuery({ minPrice: "0x20" }),
    /Minimum price must be a non-negative number/,
  );
});

test("filters and sorts using the selected rental rate and today's availability", () => {
  const equipment = [
    equipmentItem("1", { name: "Drill", dailyRate: 100 }),
    equipmentItem("2", {
      name: "Mixer",
      location: "Dhaka North",
      dailyRate: 200,
    }),
    equipmentItem("3", { name: "Saw", dailyRate: 300 }),
  ];
  const options = parseEquipmentListingQuery({
    search: "dhaka",
    rentalType: "weekly",
    minPrice: "500",
    maxPrice: "1500",
    availability: "available",
    sort: "price-low-to-high",
  });
  const availableQuantities = new Map([
    ["1", 1],
    ["2", 0],
    ["3", 2],
  ]);

  assert.deepEqual(
    createEquipmentListing({ equipment, availableQuantities, options }).map(
      (item) => item.id,
    ),
    ["1"],
  );
});

test("sorts recent listings newest-first and includes availability counts", () => {
  const equipment = [
    equipmentItem("1", { createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    equipmentItem("2", { createdAt: new Date("2026-02-01T00:00:00.000Z") }),
  ];
  const options = parseEquipmentListingQuery({});
  const availableQuantities = new Map([
    ["1", 0],
    ["2", 2],
  ]);
  const items = createEquipmentListing({
    equipment,
    availableQuantities,
    options,
  });

  assert.deepEqual(items.map((item) => item.id), ["2", "1"]);
  assert.equal(items[0].availabilityStatus, "available");
  assert.equal(items[1].availabilityStatus, "unavailable");
});

test("filters by category and sorts rental prices in both directions", () => {
  const equipment = [
    equipmentItem("1", { dailyRate: 100 }),
    equipmentItem("2", { dailyRate: 200 }),
    equipmentItem("3", { category: "Building", dailyRate: 50 }),
  ];
  const availableQuantities = new Map([
    ["1", 1],
    ["2", 1],
    ["3", 1],
  ]);
  const lowToHighOptions = parseEquipmentListingQuery({
    category: "power tools",
    sort: "price-low-to-high",
  });
  const highToLowOptions = parseEquipmentListingQuery({
    category: "Power Tools",
    sort: "price-high-to-low",
  });

  assert.deepEqual(
    createEquipmentListing({
      equipment,
      availableQuantities,
      options: lowToHighOptions,
    }).map((item) => item.id),
    ["1", "2"],
  );
  assert.deepEqual(
    createEquipmentListing({
      equipment,
      availableQuantities,
      options: highToLowOptions,
    }).map((item) => item.id),
    ["2", "1"],
  );
});

test("calculates quantities after pending reservations and paid bookings", () => {
  const quantities = calculateAvailableQuantities(
    [equipmentItem("1", { quantity: 4 }), equipmentItem("2", { quantity: 1 })],
    [{ equipmentId: "1", quantity: 1 }],
    [{ equipmentId: "1", quantity: 2 }],
  );

  assert.equal(quantities.get("1"), 1);
  assert.equal(quantities.get("2"), 1);
});
