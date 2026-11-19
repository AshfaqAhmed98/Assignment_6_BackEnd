import { Router } from "express";
import mongoose from "mongoose";
import { requireJwt } from "../middleware/require-jwt.js";
import { requirePermission } from "../middleware/permissions.js";
import { Booking } from "../models/booking.model.js";
import { BookingReservation } from "../models/booking-reservation.model.js";
import { Payment } from "../models/payment.model.js";

function getPaymentIntentId(paymentIntent) {
  if (typeof paymentIntent === "string") {
    return paymentIntent;
  }
  return paymentIntent && typeof paymentIntent.id === "string"
    ? paymentIntent.id
    : null;
}

async function fulfillCheckoutSession(session, eventId) {
  const reservationId = session.metadata?.reservationId;
  if (!reservationId || !mongoose.isValidObjectId(reservationId)) {
    return;
  }

  const reservation = await BookingReservation.findById(reservationId);
  if (!reservation || reservation.stripeSessionId !== session.id) {
    return;
  }
  if (session.payment_status !== "paid") {
    return;
  }
  if (
    session.currency !== "bdt" ||
    session.amount_total !== reservation.amountMinor ||
    session.metadata?.customerId !== reservation.customerId
  ) {
    throw new Error("Stripe Checkout details do not match the reservation.");
  }

  const stripePaymentIntentId = getPaymentIntentId(session.payment_intent);
  const booking = await Booking.findOneAndUpdate(
    { reservationId: reservation._id },
    {
      $setOnInsert: {
        reservationId: reservation._id,
        customerId: reservation.customerId,
        customerName: reservation.customerName ?? "",
        customerEmail: reservation.customerEmail ?? "",
        equipmentId: reservation.equipmentId,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        rentalType: reservation.rentalType,
        quantity: reservation.quantity,
        billedUnits: reservation.billedUnits,
        unitAmountMinor: reservation.unitAmountMinor,
        amountMinor: reservation.amountMinor,
        contactNumber: reservation.contactNumber,
        deliveryAddress: reservation.deliveryAddress,
        additionalNotes: reservation.additionalNotes,
        paymentStatus: "paid",
        stripeSessionId: session.id,
        stripePaymentIntentId,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  await Payment.updateOne(
    { stripeSessionId: session.id },
    {
      $setOnInsert: {
        bookingId: booking._id,
        customerId: reservation.customerId,
        amountMinor: session.amount_total,
        currency: session.currency,
        status: "paid",
        stripeSessionId: session.id,
        stripePaymentIntentId,
        stripeEventId: eventId,
      },
    },
    { upsert: true },
  );

  await BookingReservation.updateOne(
    { _id: reservation._id },
    { $set: { status: "paid" } },
  );
}

export function createStripeWebhookHandler(stripe) {
  return async (request, response) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !webhookSecret) {
      return response.status(503).json({
        message: "Stripe webhooks are not configured on the server.",
      });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        request.get("stripe-signature"),
        webhookSecret,
      );
    } catch {
      return response.status(400).json({
        message: "Stripe webhook signature verification failed.",
      });
    }

    try {
      if (event.type === "checkout.session.completed") {
        await fulfillCheckoutSession(event.data.object, event.id);
      } else if (event.type === "checkout.session.expired") {
        await BookingReservation.updateOne(
          {
            stripeSessionId: event.data.object.id,
            status: "pending",
          },
          { $set: { status: "expired" } },
        );
      }
    } catch (error) {
      console.error("Stripe webhook processing failed:", error);
      return response.status(500).json({
        message: "The Stripe event could not be processed.",
      });
    }

    return response.json({ received: true });
  };
}

export function createPaymentsRouter(auth) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const readBookingStatus = requirePermission("booking:create");

  router.get(
    "/checkout-status",
    authenticate,
    readBookingStatus,
    async (request, response) => {
      const sessionId = request.query.session_id;
      if (
        typeof sessionId !== "string" ||
        !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)
      ) {
        return response.status(400).json({
          message: "Provide a valid Stripe Checkout session ID.",
        });
      }
      if (mongoose.connection.readyState !== 1) {
        return response.status(503).json({
          message: "Payment status is temporarily unavailable.",
        });
      }

      const reservation = await BookingReservation.findOne({
        stripeSessionId: sessionId,
        customerId: request.auth.userId,
      }).lean();
      if (!reservation) {
        return response.status(404).json({
          message: "Checkout session not found.",
        });
      }

      const booking =
        reservation.status === "paid"
          ? await Booking.findOne({ reservationId: reservation._id })
              .select("_id")
              .lean()
          : null;
      return response.json({
        status: reservation.status,
        bookingId: booking?._id.toString() ?? null,
        amountMinor: reservation.amountMinor,
        currency: "bdt",
      });
    },
  );

  return router;
}
