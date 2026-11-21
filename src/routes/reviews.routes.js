import { Router } from "express";
import mongoose from "mongoose";
import { requireJwt } from "../middleware/require-jwt.js";
import { requirePermission } from "../middleware/permissions.js";
import { Booking } from "../models/booking.model.js";
import { Equipment } from "../models/equipment.model.js";
import { Review } from "../models/review.model.js";
import { getUtcStartOfDay } from "../services/rental-pricing.js";

const reviewLimit = 8;

export function parseReviewInput(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const { bookingId, rating, comment } = body;
  if (
    typeof bookingId !== "string" ||
    !mongoose.isValidObjectId(bookingId) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    typeof comment !== "string" ||
    comment.trim().length < 2 ||
    comment.trim().length > 1200
  ) {
    return null;
  }

  return { bookingId, rating, comment: comment.trim() };
}

function isAvailable(response) {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  response.status(503).json({
    message: "Reviews are temporarily unavailable.",
  });
  return false;
}

export function createReviewsRouter(
  auth,
  {
    ReviewModel = Review,
    BookingModel = Booking,
    EquipmentModel = Equipment,
  } = {},
) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const manageReviews = requirePermission("reviews:manage-own");

  router.get("/", async (_request, response) => {
    if (!isAvailable(response)) {
      return;
    }

    const items = await ReviewModel.find({})
      .sort({ createdAt: -1 })
      .limit(reviewLimit)
      .lean();

    return response.json({
      items: items.map((review) => ({
        id: review._id.toString(),
        customerName: review.customerName,
        equipmentName: review.equipmentName,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      })),
    });
  });

  router.post("/", authenticate, manageReviews, async (request, response) => {
    if (!isAvailable(response)) {
      return;
    }

    const input = parseReviewInput(request.body);
    if (!input) {
      return response.status(400).json({
        message:
          "Provide a completed booking, a rating from 1 to 5, and a comment of 2 to 1200 characters.",
      });
    }

    const booking = await BookingModel.findOne({
      _id: input.bookingId,
      customerId: request.auth.userId,
      paymentStatus: "paid",
      endDate: { $lte: getUtcStartOfDay() },
    }).lean();
    if (!booking) {
      return response.status(404).json({
        message: "A completed paid booking could not be found.",
      });
    }

    const equipment = await EquipmentModel.findById(booking.equipmentId)
      .select("name")
      .lean();

    try {
      const review = await ReviewModel.create({
        bookingId: booking._id,
        customerId: request.auth.userId,
        customerName: request.auth.name?.trim() || "GearRent customer",
        equipmentName: equipment?.name || "Equipment rental",
        rating: input.rating,
        comment: input.comment,
      });

      return response.status(201).json({
        item: {
          id: review._id.toString(),
          customerName: review.customerName,
          equipmentName: review.equipmentName,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
        },
      });
    } catch (error) {
      if (error?.code === 11000) {
        return response.status(409).json({
          message: "A review has already been submitted for this booking.",
        });
      }
      throw error;
    }
  });

  return router;
}
