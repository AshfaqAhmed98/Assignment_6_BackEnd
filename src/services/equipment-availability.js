import { randomUUID } from "node:crypto";
import { Booking } from "../models/booking.model.js";
import { BookingReservation } from "../models/booking-reservation.model.js";
import { BookingReservationLock } from "../models/booking-reservation-lock.model.js";
import { countAvailableQuantity } from "./rental-pricing.js";

export class EquipmentReservationLockError extends Error {
  constructor() {
    super("Equipment availability is being updated. Please retry.");
    this.name = "EquipmentReservationLockError";
  }
}

export async function getAvailableQuantity({
  equipmentId,
  totalQuantity,
  startDate,
  endDate,
  now = new Date(),
}) {
  const overlap = {
    equipmentId,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  const [reservations, bookings] = await Promise.all([
    BookingReservation.find({
      ...overlap,
      status: "pending",
      expiresAt: { $gt: now },
    })
      .select("quantity")
      .lean(),
    Booking.find({ ...overlap, paymentStatus: "paid" })
      .select("quantity")
      .lean(),
  ]);

  return countAvailableQuantity(totalQuantity, [
    ...reservations.map((reservation) => reservation.quantity),
    ...bookings.map((booking) => booking.quantity),
  ]);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withEquipmentReservationLock(equipmentId, operation) {
  const lockId = String(equipmentId);
  try {
    await BookingReservationLock.updateOne(
      { _id: lockId },
      { $setOnInsert: { lockedUntil: new Date(0), token: null } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }

  const token = randomUUID();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const now = new Date();
    const lock = await BookingReservationLock.findOneAndUpdate(
      { _id: lockId, lockedUntil: { $lte: now } },
      {
        $set: {
          token,
          lockedUntil: new Date(now.getTime() + 15000),
        },
      },
      { new: true },
    );

    if (lock) {
      try {
        return await operation();
      } finally {
        await BookingReservationLock.updateOne(
          { _id: lockId, token },
          { $set: { token: null, lockedUntil: new Date(0) } },
        );
      }
    }

    await wait(50);
  }

  throw new EquipmentReservationLockError();
}
