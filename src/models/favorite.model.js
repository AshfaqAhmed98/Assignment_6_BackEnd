import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    equipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Equipment",
      required: true,
    },
  },
  { timestamps: true },
);

favoriteSchema.index({ customerId: 1, equipmentId: 1 }, { unique: true });

export const Favorite =
  mongoose.models.Favorite || mongoose.model("Favorite", favoriteSchema);
