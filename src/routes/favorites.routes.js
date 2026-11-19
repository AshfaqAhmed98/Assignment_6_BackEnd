import { Router } from "express";
import mongoose from "mongoose";
import { requireJwt } from "../middleware/require-jwt.js";
import { requirePermission } from "../middleware/permissions.js";
import { Equipment } from "../models/equipment.model.js";
import { Favorite } from "../models/favorite.model.js";

function isAvailable(response) {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  response.status(503).json({
    message: "Favorites are temporarily unavailable.",
  });
  return false;
}

export function createFavoritesRouter(auth) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const manageFavorites = requirePermission("favorites:manage-own");

  router.get("/", authenticate, manageFavorites, async (request, response) => {
    if (!isAvailable(response)) {
      return;
    }

    const favorites = await Favorite.find({ customerId: request.auth.userId })
      .sort({ createdAt: -1 })
      .lean();
    const equipmentIds = favorites.map((favorite) => favorite.equipmentId);
    const equipment = await Equipment.find({
      _id: { $in: equipmentIds },
      approvalStatus: "approved",
    })
      .select("name category location dailyRate image description quantity")
      .lean();
    const favoriteDates = new Map(
      favorites.map((favorite) => [
        favorite.equipmentId.toString(),
        favorite.createdAt,
      ]),
    );

    return response.json({
      items: equipment.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        category: item.category,
        location: item.location,
        dailyRate: item.dailyRate,
        image: item.image,
        description: item.description,
        quantity: item.quantity ?? 1,
        favoritedAt: favoriteDates.get(item._id.toString()),
      })),
    });
  });

  router.get(
    "/:equipmentId",
    authenticate,
    manageFavorites,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.equipmentId)) {
        return response.status(404).json({ message: "Equipment not found." });
      }
      if (!isAvailable(response)) {
        return;
      }

      const favorite = await Favorite.exists({
        customerId: request.auth.userId,
        equipmentId: request.params.equipmentId,
      });
      return response.json({ isFavorite: Boolean(favorite) });
    },
  );

  router.post(
    "/:equipmentId",
    authenticate,
    manageFavorites,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.equipmentId)) {
        return response.status(404).json({ message: "Equipment not found." });
      }
      if (!isAvailable(response)) {
        return;
      }

      const equipment = await Equipment.exists({
        _id: request.params.equipmentId,
        approvalStatus: "approved",
      });
      if (!equipment) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      try {
        await Favorite.updateOne(
          {
            customerId: request.auth.userId,
            equipmentId: request.params.equipmentId,
          },
          {
            $setOnInsert: {
              customerId: request.auth.userId,
              equipmentId: request.params.equipmentId,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }
      }
      return response.status(204).end();
    },
  );

  router.delete(
    "/:equipmentId",
    authenticate,
    manageFavorites,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.equipmentId)) {
        return response.status(404).json({ message: "Equipment not found." });
      }
      if (!isAvailable(response)) {
        return;
      }

      await Favorite.deleteOne({
        customerId: request.auth.userId,
        equipmentId: request.params.equipmentId,
      });
      return response.status(204).end();
    },
  );

  return router;
}
