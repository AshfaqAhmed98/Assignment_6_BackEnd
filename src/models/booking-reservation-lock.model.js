import mongoose from "mongoose";

const bookingReservationLockSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    token: {
      type: String,
      default: null,
    },
    lockedUntil: {
      type: Date,
      default: () => new Date(0),
    },
  },
  { versionKey: false },
);

export const BookingReservationLock =
  mongoose.models.BookingReservationLock ||
  mongoose.model("BookingReservationLock", bookingReservationLockSchema);
