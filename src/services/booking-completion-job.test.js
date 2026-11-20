import assert from "node:assert/strict";
import test from "node:test";
import { runBookingCompletionJob } from "./booking-completion-job.js";

function createBookingModel(booking) {
  return {
    async updateMany(filter, update) {
      if (filter.endDate.$lte) {
        if (new Date(booking.endDate) <= filter.endDate.$lte) {
          booking.bookingStatus = update.$set.bookingStatus;
        }
      } else if (
        new Date(booking.startDate) <= filter.startDate.$lte &&
        new Date(booking.endDate) > filter.endDate.$gt
      ) {
        booking.bookingStatus = update.$set.bookingStatus;
      }
    },
    find() {
      return {
        lean: async () =>
          booking.bookingStatus === "completed" &&
          (!booking.customerCompletionNotifiedAt ||
            !booking.ownerCompletionNotifiedAt)
            ? [{ ...booking }]
            : [],
      };
    },
    findOneAndUpdate(filter, update) {
      const claimed =
        String(filter._id) === String(booking._id) &&
        !booking.completionNotificationClaimedAt;
      if (claimed) {
        booking.completionNotificationClaimedAt =
          update.$set.completionNotificationClaimedAt;
      }
      return { lean: async () => (claimed ? { ...booking } : null) };
    },
    async updateOne(_filter, update) {
      Object.assign(booking, update.$set ?? {});
      for (const field of Object.keys(update.$unset ?? {})) {
        delete booking[field];
      }
    },
  };
}

test("marks ended rentals complete and notifies the renter and equipment owner", async () => {
  const booking = {
    _id: "booking-1",
    equipmentId: "equipment-1",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-03T00:00:00.000Z"),
    paymentStatus: "paid",
    bookingStatus: "ongoing",
    customerEmail: "renter@example.test",
    customerName: "Renter",
  };
  const messages = [];
  const errors = [];
  const result = await runBookingCompletionJob({
    now: new Date("2026-04-03T08:00:00.000Z"),
    BookingModel: createBookingModel(booking),
    EquipmentModel: {
      findById() {
        return {
          select() {
            return {
              lean: async () => ({
                name: "Generator",
                ownerId: "507f1f77bcf86cd799439011",
              }),
            };
          },
        };
      },
    },
    userCollection: () => ({
      findOne: async () => ({
        name: "Owner",
        email: "owner@example.test",
      }),
    }),
    mailer: {
      isConfigured: true,
      async sendMail(message) {
        messages.push(message);
      },
    },
    logger: { error: (...args) => errors.push(args) },
  });

  assert.equal(booking.bookingStatus, "completed");
  assert.equal(result.notificationsAttempted, 1);
  assert.deepEqual(
    messages.map((message) => message.to).sort(),
    ["owner@example.test", "renter@example.test"],
  );
  assert.ok(booking.customerCompletionNotifiedAt);
  assert.ok(booking.ownerCompletionNotifiedAt);
  assert.equal(booking.completionNotificationClaimedAt, undefined);
  assert.equal(errors.length, 0);
});

test("updates booking status while leaving email pending without SMTP", async () => {
  const booking = {
    _id: "booking-2",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-03T00:00:00.000Z"),
    paymentStatus: "paid",
    bookingStatus: "ongoing",
  };
  const result = await runBookingCompletionJob({
    now: new Date("2026-04-03T08:00:00.000Z"),
    BookingModel: createBookingModel(booking),
    mailer: { isConfigured: false },
  });

  assert.equal(booking.bookingStatus, "completed");
  assert.equal(result.notificationsAttempted, 0);
});
