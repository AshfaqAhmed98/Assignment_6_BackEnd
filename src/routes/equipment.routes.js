import { Router } from "express";
import mongoose from "mongoose";
import { requireJwt } from "../middleware/require-jwt.js";
import { requirePermission } from "../middleware/permissions.js";
import { Booking } from "../models/booking.model.js";
import { BookingReservation } from "../models/booking-reservation.model.js";
import { Equipment } from "../models/equipment.model.js";
import {
  getAvailableQuantities,
  getAvailableQuantity,
  withEquipmentReservationLock,
} from "../services/equipment-availability.js";
import {
  createEquipmentListing,
  parseEquipmentListingQuery,
} from "../services/equipment-listing.js";
import {
  getUtcStartOfDay,
  parseRentalDateRange,
} from "../services/rental-pricing.js";

const editableFields = new Set([
  "name",
  "category",
  "location",
  "dailyRate",
  "rentalPrice",
  "rentalType",
  "image",
  "description",
  "condition",
  "brand",
  "model",
  "rentalTerms",
]);
const creatableFields = new Set([...editableFields, "quantity"]);
const requiredEquipmentFields = [
  "name",
  "category",
  "location",
  "image",
  "description",
];
const rentalPeriodDays = Object.freeze({
  daily: 1,
  weekly: 7,
  monthly: 30,
});
const rentalTypes = new Set(Object.keys(rentalPeriodDays));
const equipmentConditions = new Set(["New", "Excellent", "Good", "Fair"]);

function normalizeRentalRate(price, rentalType) {
  const priceMinor = Math.round(price * 100);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 1) {
    return null;
  }

  const dailyRateMinor = Math.max(
    1,
    Math.round(priceMinor / rentalPeriodDays[rentalType]),
  );
  return {
    rentalPrice: priceMinor / 100,
    rentalType,
    dailyRate: dailyRateMinor / 100,
  };
}

export function parseEquipmentInput(body, { partial = false } = {}) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const keys = Object.keys(body);
  const allowedFields = partial ? editableFields : creatableFields;
  if (
    keys.length === 0 ||
    keys.some((key) => !allowedFields.has(key)) ||
    (!partial &&
      (requiredEquipmentFields.some((key) => !(key in body)) ||
        (!("dailyRate" in body) &&
          !("rentalPrice" in body) &&
          !("rentalType" in body))))
  ) {
    return null;
  }

  const input = {};
  const limits = {
    name: 120,
    category: 80,
    location: 120,
    image: 2048,
    description: 2000,
    condition: 40,
    brand: 80,
    model: 80,
    rentalTerms: 3000,
  };
  const optionalTextFields = new Set(["brand", "model"]);

  for (const key of keys) {
    const value = body[key];
    if (key === "quantity") {
      if (!Number.isInteger(value) || value < 1 || value > 10000) {
        return null;
      }
      input[key] = value;
      continue;
    }
    if (key === "dailyRate") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000000 ||
        !Number.isSafeInteger(Math.round(value * 100))
      ) {
        return null;
      }
      input[key] = value;
      continue;
    }
    if (key === "rentalPrice") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000000
      ) {
        return null;
      }
      input[key] = value;
      continue;
    }
    if (key === "rentalType") {
      if (typeof value !== "string" || !rentalTypes.has(value)) {
        return null;
      }
      input[key] = value;
      continue;
    }
    if (key === "condition" && !equipmentConditions.has(value)) {
      return null;
    }
    if (
      typeof value !== "string" ||
      (!optionalTextFields.has(key) && value.trim().length === 0) ||
      value.trim().length > limits[key]
    ) {
      return null;
    }
    input[key] = value.trim();
  }

  if (
    ("rentalPrice" in input) !== ("rentalType" in input) ||
    ("dailyRate" in input &&
      ("rentalPrice" in input || "rentalType" in input))
  ) {
    return null;
  }

  if ("rentalPrice" in input && "rentalType" in input) {
    const normalizedRate = normalizeRentalRate(
      input.rentalPrice,
      input.rentalType,
    );
    if (!normalizedRate) {
      return null;
    }
    Object.assign(input, normalizedRate);
  } else if ("dailyRate" in input) {
    input.dailyRate = Math.round(input.dailyRate * 100) / 100;
    input.rentalPrice = input.dailyRate;
    input.rentalType = "daily";
  }

  if (input.image) {
    if (input.image.startsWith("/")) {
      if (input.image.startsWith("//")) {
        return null;
      }
    } else {
      try {
        const imageUrl = new URL(input.image);
        if (
          !["http:", "https:"].includes(imageUrl.protocol) ||
          !imageUrl.hostname
        ) {
          return null;
        }
      } catch {
        return null;
      }
    }
  }

  return input;
}

function toEquipmentResponse(item) {
  return {
    id: item._id.toString(),
    name: item.name,
    category: item.category,
    location: item.location,
    dailyRate: item.dailyRate,
    rentalPrice: item.rentalPrice ?? item.dailyRate,
    rentalType: item.rentalType ?? "daily",
    quantity: item.quantity ?? 1,
    image: item.image,
    description: item.description,
    condition: item.condition ?? "",
    brand: item.brand ?? "",
    model: item.model ?? "",
    rentalTerms: item.rentalTerms ?? "",
    approvalStatus: item.approvalStatus,
    ownerName: item.ownerName ?? "",
  };
}

function isAvailable(response) {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  response.status(503).json({
    message: "Equipment data is temporarily unavailable.",
  });
  return false;
}

function invalidEquipment(response) {
  return response.status(400).json({
    message:
      "Provide valid equipment details, a positive rental price, a supported rental type, quantity, condition, image URL, and rental terms.",
  });
}

export function createEquipmentRouter(auth) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const readEquipment = requirePermission("equipment:read");
  const manageEquipment = requirePermission("equipment:manage-own");
  const createEquipment = requirePermission("equipment:create");
  const approveEquipment = requirePermission("equipment:approve");

  router.get("/", async (request, response) => {
    let options;
    try {
      options = parseEquipmentListingQuery(request.query);
    } catch (error) {
      return response.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Provide valid equipment filters.",
      });
    }

    if (!isAvailable(response)) {
      return;
    }

    const equipment = await Equipment.find({ approvalStatus: "approved" })
      .select(
        "name category location dailyRate rentalPrice rentalType quantity image description createdAt",
      )
      .lean();
    const categories = [
      ...new Set(equipment.map((item) => item.category)),
    ].sort((left, right) => left.localeCompare(right));
    const currentDate = new Date();
    const startDate = new Date(
      Date.UTC(
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth(),
        currentDate.getUTCDate(),
      ),
    );
    const availableQuantities = await getAvailableQuantities({
      equipment,
      startDate,
      endDate: new Date(startDate.getTime() + 24 * 60 * 60 * 1000),
    });
    const items = createEquipmentListing({
      equipment,
      availableQuantities,
      options,
    });

    return response.json({ items, categories, total: items.length });
  });

  router.get("/featured", async (_request, response) => {
    if (!isAvailable(response)) {
      return;
    }

    const equipment = await Equipment.find({ approvalStatus: "approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .select("name category location dailyRate image description")
      .lean();

    response.json({
      items: equipment.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        category: item.category,
        location: item.location,
        dailyRate: item.dailyRate,
        image: item.image,
        description: item.description,
      })),
    });
  });

  router.get(
    "/mine",
    authenticate,
    manageEquipment,
    async (request, response) => {
      if (!isAvailable(response)) {
        return;
      }

      const filter =
        request.auth.role === "Admin"
          ? {}
          : { ownerId: request.auth.userId };
      const equipment = await Equipment.find(filter)
        .sort({ createdAt: -1 })
        .lean();
      return response.json({ items: equipment.map(toEquipmentResponse) });
    },
  );

  router.get(
    "/mine/:id",
    authenticate,
    manageEquipment,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "Equipment not found." });
      }
      if (!isAvailable(response)) {
        return;
      }

      const filter =
        request.auth.role === "Admin"
          ? { _id: request.params.id }
          : { _id: request.params.id, ownerId: request.auth.userId };
      const item = await Equipment.findOne(filter).lean();
      if (!item) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      return response.json({ item: toEquipmentResponse(item) });
    },
  );

  router.get(
    "/admin/pending",
    authenticate,
    approveEquipment,
    async (_request, response) => {
      if (!isAvailable(response)) {
        return;
      }

      const equipment = await Equipment.find({ approvalStatus: "pending" })
        .sort({ createdAt: 1 })
        .lean();
      return response.json({ items: equipment.map(toEquipmentResponse) });
    },
  );

  router.patch(
    "/admin/:id/approval",
    authenticate,
    approveEquipment,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      const status = request.body?.approvalStatus;
      if (status !== "approved" && status !== "rejected") {
        return response.status(400).json({
          message: "Approval status must be approved or rejected.",
        });
      }
      if (!isAvailable(response)) {
        return;
      }

      const item = await Equipment.findByIdAndUpdate(
        request.params.id,
        { $set: { approvalStatus: status } },
        { new: true, runValidators: true },
      ).lean();

      if (!item) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      return response.json({ item: toEquipmentResponse(item) });
    },
  );

  router.post(
    "/",
    authenticate,
    createEquipment,
    async (request, response) => {
      const input = parseEquipmentInput(request.body);
      if (!input) {
        return invalidEquipment(response);
      }
      if (!isAvailable(response)) {
        return;
      }

      const item = await Equipment.create({
        ...input,
        ownerId: request.auth.userId,
        ownerName: request.auth.name ?? "",
        approvalStatus: "pending",
      });
      return response.status(201).json({ item: toEquipmentResponse(item) });
    },
  );

  router.patch(
    "/:id",
    authenticate,
    manageEquipment,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      const input = parseEquipmentInput(request.body, { partial: true });
      if (!input) {
        return invalidEquipment(response);
      }
      if (!isAvailable(response)) {
        return;
      }

      const filter =
        request.auth.role === "Admin"
          ? { _id: request.params.id }
          : { _id: request.params.id, ownerId: request.auth.userId };
      const item = await Equipment.findOneAndUpdate(
        filter,
        { $set: { ...input, approvalStatus: "pending" } },
        { new: true, runValidators: true },
      ).lean();

      if (!item) {
        return response.status(404).json({ message: "Equipment not found." });
      }
      return response.json({ item: toEquipmentResponse(item) });
    },
  );

  router.delete(
    "/:id",
    authenticate,
    manageEquipment,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "Equipment not found." });
      }
      if (!isAvailable(response)) {
        return;
      }

      const filter =
        request.auth.role === "Admin"
          ? { _id: request.params.id }
          : { _id: request.params.id, ownerId: request.auth.userId };
      const result = await withEquipmentReservationLock(
        request.params.id,
        async () => {
          const now = new Date();
          const [activeReservation, activeBooking] = await Promise.all([
            BookingReservation.exists({
              equipmentId: request.params.id,
              status: "pending",
              expiresAt: { $gt: now },
            }),
            Booking.exists({
              equipmentId: request.params.id,
              paymentStatus: "paid",
              endDate: { $gt: now },
            }),
          ]);
          if (activeReservation || activeBooking) {
            return null;
          }
          return Equipment.deleteOne(filter);
        },
      );
      if (result === null) {
        return response.status(409).json({
          message:
            "Equipment with an active checkout or paid rental cannot be deleted.",
        });
      }
      if (result.deletedCount === 0) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      return response.status(204).end();
    },
  );

  router.get(
    "/:id/availability",
    authenticate,
    readEquipment,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      const requestedQuantity = Number(request.query.quantity);
      if (
        !Number.isInteger(requestedQuantity) ||
        requestedQuantity < 1 ||
        requestedQuantity > 10000
      ) {
        return response.status(400).json({
          message: "Requested quantity must be a positive whole number.",
        });
      }

      let dateRange;
      try {
        dateRange = parseRentalDateRange(
          request.query.startDate,
          request.query.endDate,
        );
      } catch (error) {
        return response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : "Provide valid rental start and end dates.",
        });
      }
      if (dateRange.startDate < getUtcStartOfDay()) {
        return response.status(400).json({
          message: "Rental start date cannot be in the past.",
        });
      }

      if (!isAvailable(response)) {
        return;
      }

      const equipment = await Equipment.findOne({
        _id: request.params.id,
        approvalStatus: "approved",
      })
        .select("quantity")
        .lean();
      if (!equipment) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      const availableQuantity = await getAvailableQuantity({
        equipmentId: equipment._id,
        totalQuantity: equipment.quantity ?? 1,
        ...dateRange,
      });
      return response.json({
        availableQuantity,
        requestedQuantity,
        available: availableQuantity >= requestedQuantity,
      });
    },
  );

  router.get("/:id", authenticate, readEquipment, async (request, response) => {
    if (!mongoose.isValidObjectId(request.params.id)) {
      return response.status(404).json({
        message: "Equipment not found.",
      });
    }
    if (!isAvailable(response)) {
      return;
    }

    const item = await Equipment.findOne({
      _id: request.params.id,
      approvalStatus: "approved",
    })
      .select(
        "name category location dailyRate rentalPrice rentalType quantity image description condition brand model rentalTerms ownerName",
      )
      .lean();

    if (!item) {
      return response.status(404).json({
        message: "Equipment not found.",
      });
    }

    const currentDate = new Date();
    const startDate = new Date(
      Date.UTC(
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth(),
        currentDate.getUTCDate(),
      ),
    );
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const availableQuantity = await getAvailableQuantity({
      equipmentId: item._id,
      totalQuantity: item.quantity ?? 1,
      startDate,
      endDate,
    });

    return response.json({
      item: {
        id: item._id.toString(),
        name: item.name,
        category: item.category,
        location: item.location,
        dailyRate: item.dailyRate,
        rentalPrice: item.rentalPrice ?? item.dailyRate,
        rentalType: item.rentalType ?? "daily",
        image: item.image,
        description: item.description,
        condition: item.condition ?? "",
        brand: item.brand ?? "",
        model: item.model ?? "",
        rentalTerms: item.rentalTerms ?? "",
        totalQuantity: item.quantity ?? 1,
        availableQuantity,
        ownerName: item.ownerName ?? "",
      },
    });
  });

  return router;
}
