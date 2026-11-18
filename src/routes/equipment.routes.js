import { Router } from "express";
import mongoose from "mongoose";
import { requireJwt } from "../middleware/require-jwt.js";
import { requirePermission } from "../middleware/permissions.js";
import { Equipment } from "../models/equipment.model.js";

const editableFields = new Set([
  "name",
  "category",
  "location",
  "dailyRate",
  "image",
  "description",
]);

function parseEquipmentInput(body, { partial = false } = {}) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const keys = Object.keys(body);
  if (
    keys.length === 0 ||
    keys.some((key) => !editableFields.has(key)) ||
    (!partial && [...editableFields].some((key) => !(key in body)))
  ) {
    return null;
  }

  const input = {};
  for (const key of keys) {
    const value = body[key];
    if (key === "dailyRate") {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return null;
      }
      input[key] = value;
      continue;
    }

    const limits = {
      name: 120,
      category: 80,
      location: 120,
      image: 2048,
      description: 2000,
    };
    if (
      typeof value !== "string" ||
      value.trim().length === 0 ||
      value.trim().length > limits[key]
    ) {
      return null;
    }
    input[key] = value.trim();
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
    image: item.image,
    description: item.description,
    approvalStatus: item.approvalStatus,
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
      "Provide a name, category, location, positive daily rate, image URL or path, and description within the field limits.",
  });
}

export function createEquipmentRouter(auth) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const readEquipment = requirePermission("equipment:read");
  const manageEquipment = requirePermission("equipment:manage-own");
  const createEquipment = requirePermission("equipment:create");
  const approveEquipment = requirePermission("equipment:approve");

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
      const result = await Equipment.deleteOne(filter);
      if (result.deletedCount === 0) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      return response.status(204).end();
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
      .select("name category location dailyRate image description")
      .lean();

    if (!item) {
      return response.status(404).json({
        message: "Equipment not found.",
      });
    }

    return response.json({
      item: {
        id: item._id.toString(),
        name: item.name,
        category: item.category,
        location: item.location,
        dailyRate: item.dailyRate,
        image: item.image,
        description: item.description,
      },
    });
  });

  return router;
}
