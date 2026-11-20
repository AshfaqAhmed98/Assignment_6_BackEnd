import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookingReservation",
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
    paymentStatus: {
      type: String,
      enum: ["paid"],
      required: true,
    },
    bookingStatus: {
      type: String,
      enum: ["upcoming", "ongoing", "completed"],
      default: "upcoming",
      index: true,
    },
    customerCompletionNotifiedAt: {
      type: Date,
      default: null,
    },
    ownerCompletionNotifiedAt: {
      type: Date,
      default: null,
    },
    completionNotificationClaimedAt: {
      type: Date,
      default: null,
    },
    completionNotificationSentAt: {
      type: Date,
      default: null,
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
  },
  { timestamps: true },
);

export const Booking =
  mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
