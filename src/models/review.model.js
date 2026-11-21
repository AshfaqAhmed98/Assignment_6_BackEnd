import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    equipmentName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isInteger,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 1200,
    },
  },
  { timestamps: true },
);

export const Review =
  mongoose.models.Review || mongoose.model("Review", reviewSchema);
