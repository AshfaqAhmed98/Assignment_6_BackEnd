import { Router } from "express";
import mongoose from "mongoose";
import { Equipment } from "../models/equipment.model.js";

const router = Router();

router.get("/featured", async (_request, response) => {
  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({
      message: "Equipment data is temporarily unavailable.",
    });
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

export default router;
