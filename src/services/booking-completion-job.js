import cron from "node-cron";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model.js";
import { Equipment } from "../models/equipment.model.js";
import {
  createBookingCompletionEmail,
  isSmtpConfigured,
} from "./booking-completion-email.js";
import { getBookingStatus } from "./booking-status.js";

const notificationClaimMilliseconds = 10 * 60 * 1000;

function getUtcStartOfDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function getStatusUpdates(today) {
  return [
    {
      filter: {
        paymentStatus: "paid",
        startDate: { $lte: today },
        endDate: { $gt: today },
        bookingStatus: { $ne: "ongoing" },
      },
      status: "ongoing",
    },
    {
      filter: {
        paymentStatus: "paid",
        endDate: { $lte: today },
        bookingStatus: { $ne: "completed" },
      },
      status: "completed",
    },
  ];
}

export async function runBookingCompletionJob({
  now = new Date(),
  BookingModel = Booking,
  EquipmentModel = Equipment,
  userCollection = () =>
    mongoose.connection.getClient().db().collection("user"),
  mailer,
  logger = console,
}) {
  if (!mailer) {
    throw new Error("A booking completion mailer is required.");
  }

  const today = getUtcStartOfDay(now);
  for (const update of getStatusUpdates(today)) {
    await BookingModel.updateMany(update.filter, {
      $set: { bookingStatus: update.status },
    });
  }

  if (!mailer.isConfigured) {
    return { completedStatusesUpdated: true, notificationsAttempted: 0 };
  }

  const notificationFilter = {
    paymentStatus: "paid",
    bookingStatus: "completed",
    endDate: { $lte: today },
    $or: [
      { customerCompletionNotifiedAt: { $exists: false } },
      { customerCompletionNotifiedAt: null },
      { ownerCompletionNotifiedAt: { $exists: false } },
      { ownerCompletionNotifiedAt: null },
    ],
  };
  const bookings = await BookingModel.find(notificationFilter).lean();
  let notificationsAttempted = 0;

  for (const booking of bookings) {
    const leaseExpiredBefore = new Date(
      now.getTime() - notificationClaimMilliseconds,
    );
    const claimed = await BookingModel.findOneAndUpdate(
      {
        _id: booking._id,
        $or: [
          { completionNotificationClaimedAt: { $exists: false } },
          { completionNotificationClaimedAt: null },
          { completionNotificationClaimedAt: { $lt: leaseExpiredBefore } },
        ],
      },
      { $set: { completionNotificationClaimedAt: now } },
      { new: true },
    ).lean();
    if (!claimed) {
      continue;
    }

    notificationsAttempted += 1;
    let deliveryFailed = false;
    try {
      const equipment = await EquipmentModel.findById(booking.equipmentId)
        .select("name ownerId")
        .lean();
      if (!equipment) {
        throw new Error(`Equipment ${booking.equipmentId} was not found.`);
      }

      const recipients = [];
      if (!booking.customerCompletionNotifiedAt) {
        if (!booking.customerEmail) {
          logger.error(
            `Booking ${booking._id} has no renter email for completion notification.`,
          );
          deliveryFailed = true;
        } else {
          recipients.push({
            role: "renter",
            email: booking.customerEmail,
            name: booking.customerName,
            sentAtField: "customerCompletionNotifiedAt",
          });
        }
      }

      if (!booking.ownerCompletionNotifiedAt) {
        if (!mongoose.isValidObjectId(equipment.ownerId)) {
          logger.error(
            `Booking ${booking._id} has no valid equipment owner for completion notification.`,
          );
          deliveryFailed = true;
        } else {
          const owner = await userCollection().findOne(
            { _id: new mongoose.Types.ObjectId(equipment.ownerId) },
            { projection: { name: 1, email: 1 } },
          );
          if (!owner?.email) {
            logger.error(
              `Booking ${booking._id} has no owner email for completion notification.`,
            );
            deliveryFailed = true;
          } else {
            recipients.push({
              role: "owner",
              email: owner.email,
              name: owner.name,
              sentAtField: "ownerCompletionNotifiedAt",
            });
          }
        }
      }

      for (const recipient of recipients) {
        try {
          const message = createBookingCompletionEmail({
            recipientName: recipient.name,
            equipmentName: equipment.name,
            startDate: booking.startDate,
            endDate: booking.endDate,
            recipientRole: recipient.role,
          });
          await mailer.sendMail({ to: recipient.email, ...message });
          await BookingModel.updateOne(
            { _id: booking._id },
            { $set: { [recipient.sentAtField]: now } },
          );
        } catch (error) {
          deliveryFailed = true;
          logger.error(
            `Could not send booking completion email for booking ${booking._id} to the ${recipient.role}:`,
            error,
          );
        }
      }
    } catch (error) {
      deliveryFailed = true;
      logger.error(
        `Could not prepare booking completion emails for booking ${booking._id}:`,
        error,
      );
    } finally {
      await BookingModel.updateOne(
        { _id: booking._id },
        {
          $unset: { completionNotificationClaimedAt: "" },
          ...(deliveryFailed
            ? {}
            : { $set: { completionNotificationSentAt: now } }),
        },
      );
    }
  }

  return { completedStatusesUpdated: true, notificationsAttempted };
}

export function scheduleBookingCompletionUpdates({
  mailer,
  logger = console,
  schedule = cron.schedule,
  runJob = runBookingCompletionJob,
}) {
  if (!mailer) {
    throw new Error("A booking completion mailer is required.");
  }
  if (!isSmtpConfigured() && !mailer.isConfigured) {
    logger.warn(
      "SMTP is not configured; booking statuses will update, but completion emails will remain pending.",
    );
  }

  const run = () =>
    runJob({ mailer, logger }).catch((error) => {
      logger.error("Booking completion job failed:", error);
    });

  void run();
  return schedule("* * * * *", run, { timezone: "UTC" });
}
