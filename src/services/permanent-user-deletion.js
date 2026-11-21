import mongoose from "mongoose";

export class PermanentUserDeletionError extends Error {
  constructor(message, statusCode = 503, cause, { safeToRestore = false } = {}) {
    super(message);
    this.name = "PermanentUserDeletionError";
    this.statusCode = statusCode;
    this.cause = cause;
    this.safeToRestore = safeToRestore;
  }
}

function getUserIdValues(userId) {
  const id = String(userId);
  return [id, new mongoose.Types.ObjectId(id)];
}

async function expirePendingCheckoutSessions(reservations, stripe) {
  const activeCheckouts = reservations.filter(
    (reservation) =>
      reservation.status === "pending" && reservation.stripeSessionId,
  );
  if (activeCheckouts.length === 0) {
    return;
  }
  if (!stripe) {
    throw new PermanentUserDeletionError(
      "Cannot permanently delete this account while checkout sessions are active.",
      503,
      undefined,
      { safeToRestore: true },
    );
  }

  for (const reservation of activeCheckouts) {
    let checkout;
    try {
      checkout = await stripe.checkout.sessions.retrieve(
        reservation.stripeSessionId,
      );
    } catch (error) {
      if (error?.code === "resource_missing") {
        continue;
      }
      throw new PermanentUserDeletionError(
        "Could not verify an active checkout. No account data was deleted.",
        503,
        error,
        { safeToRestore: true },
      );
    }

    if (checkout.status === "complete" && checkout.payment_status !== "paid") {
      throw new PermanentUserDeletionError(
        "A checkout payment is still processing. Wait for it to finish before permanently deleting this account.",
        409,
        undefined,
        { safeToRestore: true },
      );
    }
    if (checkout.status !== "open") {
      continue;
    }

    try {
      await stripe.checkout.sessions.expire(reservation.stripeSessionId);
    } catch (error) {
      const isConflict =
        error?.code === "checkout_session_not_open" ||
        error?.code === "checkout_session_async_payment_pending";
      throw new PermanentUserDeletionError(
        isConflict
          ? "A checkout changed while deletion was starting. Refresh and retry after the payment is resolved."
          : "Could not safely close an active checkout. No account data was deleted.",
        isConflict ? 409 : 503,
        error,
        { safeToRestore: true },
      );
    }
  }
}

export async function permanentlyDeleteUserData({
  userId,
  email,
  database,
  stripe,
  models,
}) {
  const userIdValues = getUserIdValues(userId);
  const equipment = await models.Equipment.find({
    ownerId: { $in: userIdValues },
  })
    .select("_id")
    .lean();
  const equipmentIds = equipment.map((item) => item._id);
  const relatedRecordFilter = {
    $or: [
      { customerId: { $in: userIdValues } },
      { equipmentId: { $in: equipmentIds } },
    ],
  };
  const [bookings, reservations] = await Promise.all([
    models.Booking.find(relatedRecordFilter).select("_id").lean(),
    models.BookingReservation.find(relatedRecordFilter)
      .select("status stripeSessionId")
      .lean(),
  ]);
  const bookingIds = bookings.map((booking) => booking._id);

  await expirePendingCheckoutSessions(reservations, stripe);

  await models.Favorite.deleteMany({
    $or: [
      { customerId: { $in: userIdValues } },
      { equipmentId: { $in: equipmentIds } },
    ],
  });
  await models.Review.deleteMany({
    $or: [
      { customerId: { $in: userIdValues } },
      { bookingId: { $in: bookingIds } },
    ],
  });
  await models.Payment.deleteMany({
    $or: [
      { customerId: { $in: userIdValues } },
      { bookingId: { $in: bookingIds } },
    ],
  });
  await models.BookingReservation.deleteMany(relatedRecordFilter);
  await models.Booking.deleteMany(relatedRecordFilter);
  await models.BookingReservationLock.deleteMany({
    _id: { $in: equipmentIds.map(String) },
  });
  await models.Equipment.deleteMany({
    ownerId: { $in: userIdValues },
  });

  await database.collection("account").deleteMany({
    userId: { $in: userIdValues },
  });
  await database.collection("session").deleteMany({
    userId: { $in: userIdValues },
  });
  await database.collection("verification").deleteMany({
    identifier: { $in: [email, email.toLowerCase()] },
  });
  const result = await database
    .collection("user")
    .deleteOne({ _id: new mongoose.Types.ObjectId(String(userId)) });

  if (result.deletedCount !== 1) {
    throw new PermanentUserDeletionError(
      "The account could not be permanently deleted. Check its status and retry.",
      409,
    );
  }
}
