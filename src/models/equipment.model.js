import mongoose from "mongoose";

const equipmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    rentalPrice: {
      type: Number,
      min: 0,
    },
    rentalType: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "daily",
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    condition: {
      type: String,
      trim: true,
      default: "",
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    model: {
      type: String,
      trim: true,
      default: "",
    },
    rentalTerms: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: String,
      index: true,
    },
    ownerName: {
      type: String,
      trim: true,
      default: "",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true },
);

export const Equipment =
  mongoose.models.Equipment ||
  mongoose.model("Equipment", equipmentSchema);
