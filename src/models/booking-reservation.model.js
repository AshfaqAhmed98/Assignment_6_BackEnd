import mongoose from "mongoose";

const bookingReservationSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    customerEmail: {
      type: String,
      trim: true,
      default: "",
    },
    equipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Equipment",
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    rentalType: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    billedUnits: {
      type: Number,
      required: true,
      min: 1,
    },
    unitAmountMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryAddress: {
      type: String,
      required: true,
      trim: true,
    },
    additionalNotes: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "expired", "failed"],
      default: "pending",
      index: true,
    },
    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    checkoutUrl: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

bookingReservationSchema.index(
  { customerId: 1, requestId: 1 },
  { unique: true },
);

export const BookingReservation =
  mongoose.models.BookingReservation ||
  mongoose.model("BookingReservation", bookingReservationSchema);
