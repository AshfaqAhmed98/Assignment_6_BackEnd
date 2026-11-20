import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import {
  permanentlyDeleteUserData,
  PermanentUserDeletionError,
} from "./permanent-user-deletion.js";

function createModel(rows, calls, name) {
  return {
    find(filter) {
      calls.push({ operation: `${name}.find`, filter });
      return {
        select() {
          return this;
        },
        async lean() {
          return rows;
        },
      };
    },
    async deleteMany(filter) {
      calls.push({ operation: `${name}.deleteMany`, filter });
      return { deletedCount: 1 };
    },
  };
}

function createDependencies({ reservations = [] } = {}) {
  const calls = [];
  const equipmentId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const models = {
    Equipment: createModel([{ _id: equipmentId }], calls, "Equipment"),
    Booking: createModel([{ _id: bookingId }], calls, "Booking"),
    BookingReservation: createModel(
      reservations,
      calls,
      "BookingReservation",
    ),
    Favorite: createModel([], calls, "Favorite"),
    Payment: createModel([], calls, "Payment"),
    BookingReservationLock: createModel([], calls, "BookingReservationLock"),
  };
  const database = {
    collection(name) {
      return {
        async deleteMany(filter) {
          calls.push({ operation: `${name}.deleteMany`, filter });
          return { deletedCount: 1 };
        },
        async deleteOne(filter) {
          calls.push({ operation: `${name}.deleteOne`, filter });
          return { deletedCount: 1 };
        },
      };
    },
  };

  return { calls, database, equipmentId, bookingId, models };
}

test("purges linked local records and expires pending Stripe checkout first", async () => {
  const userId = new mongoose.Types.ObjectId();
  const { calls, database, equipmentId, bookingId, models } =
    createDependencies({
      reservations: [
        { status: "pending", stripeSessionId: "cs_pending" },
      ],
    });
  const stripe = {
    checkout: {
      sessions: {
        async retrieve(sessionId) {
          calls.push({ operation: "stripe.retrieve", sessionId });
          return { status: "open", payment_status: "unpaid" };
        },
        async expire(sessionId) {
          calls.push({ operation: "stripe.expire", sessionId });
        },
      },
    },
  };

  await permanentlyDeleteUserData({
    userId,
    email: "renter@example.com",
    database,
    stripe,
    models,
  });

  assert.equal(calls[0].operation, "Equipment.find");
  assert.equal(calls[1].operation, "Booking.find");
  assert.equal(calls[2].operation, "BookingReservation.find");
  assert.equal(calls[3].operation, "stripe.retrieve");
  assert.equal(calls[4].operation, "stripe.expire");
  assert.equal(calls.at(-1).operation, "user.deleteOne");
  assert.deepEqual(calls.at(-1).filter, { _id: userId });
  assert.equal(
    calls.find((call) => call.operation === "Equipment.deleteMany").filter
      .ownerId.$in.includes(userId.toString()),
    true,
  );
  assert.deepEqual(
    calls.find((call) => call.operation === "Booking.deleteMany").filter.$or[1],
    { equipmentId: { $in: [equipmentId] } },
  );
  assert.deepEqual(
    calls.find((call) => call.operation === "Payment.deleteMany").filter.$or[1],
    { bookingId: { $in: [bookingId] } },
  );
});

test("does not delete local records if a pending checkout cannot be verified", async () => {
  const { calls, database, models } = createDependencies({
    reservations: [
      { status: "pending", stripeSessionId: "cs_pending" },
    ],
  });

  await assert.rejects(
    permanentlyDeleteUserData({
      userId: new mongoose.Types.ObjectId(),
      email: "renter@example.com",
      database,
      stripe: null,
      models,
    }),
    (error) =>
      error instanceof PermanentUserDeletionError &&
      error.statusCode === 503,
  );

  assert.equal(calls.some((call) => call.operation.endsWith(".deleteMany")), false);
  assert.equal(calls.some((call) => call.operation.endsWith(".deleteOne")), false);
});
