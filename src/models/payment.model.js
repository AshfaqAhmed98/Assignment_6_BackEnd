import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      required: true,
      lowercase: true,
      default: "bdt",
    },
    status: {
      type: String,
      enum: ["paid"],
      required: true,
    },
    stripeSessionId: {
      type: String,
      required: true,
      unique: true,
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    stripeEventId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
