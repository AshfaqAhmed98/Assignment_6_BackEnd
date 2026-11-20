import { Router } from "express";
import mongoose from "mongoose";
import { requireJwt } from "../middleware/require-jwt.js";
import { requirePermission } from "../middleware/permissions.js";
import { Booking } from "../models/booking.model.js";
import { BookingReservation } from "../models/booking-reservation.model.js";
import { Equipment } from "../models/equipment.model.js";
import {
  EquipmentReservationLockError,
  getAvailableQuantity,
  withEquipmentReservationLock,
} from "../services/equipment-availability.js";
import {
  calculateRentalPrice,
  getUtcStartOfDay,
  parseRentalDateRange,
} from "../services/rental-pricing.js";
import { getBookingStatus } from "../services/booking-status.js";
import { isEquipmentOwnerActive } from "../services/account-status.js";

const checkoutHoldMilliseconds = 35 * 60 * 1000;
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class InsufficientAvailabilityError extends Error {
  constructor(availableQuantity) {
    super("The requested quantity is not available for those dates.");
    this.availableQuantity = availableQuantity;
  }
}

function isAvailable(response) {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  response.status(503).json({
    message: "Booking services are temporarily unavailable.",
  });
  return false;
}

function parseBookingInput(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const {
    equipmentId,
    startDate: startDateValue,
    endDate: endDateValue,
    requiredQuantity,
    rentalType,
    contactNumber,
    deliveryAddress,
    additionalNotes,
    requestId,
  } = body;

  if (
    typeof equipmentId !== "string" ||
    !mongoose.isValidObjectId(equipmentId) ||
    !Number.isInteger(requiredQuantity) ||
    requiredQuantity < 1 ||
    requiredQuantity > 10000 ||
    !["daily", "weekly", "monthly"].includes(rentalType) ||
    typeof contactNumber !== "string" ||
    !/^[+0-9()\-\s]{7,30}$/.test(contactNumber.trim()) ||
    typeof deliveryAddress !== "string" ||
    deliveryAddress.trim().length === 0 ||
    deliveryAddress.trim().length > 500 ||
    (additionalNotes !== undefined &&
      (typeof additionalNotes !== "string" || additionalNotes.length > 2000)) ||
    typeof requestId !== "string" ||
    !requestIdPattern.test(requestId)
  ) {
    return null;
  }

  let dateRange;
  try {
    dateRange = parseRentalDateRange(startDateValue, endDateValue);
  } catch {
    return null;
  }

  return {
    equipmentId,
    ...dateRange,
    requiredQuantity,
    rentalType,
    contactNumber: contactNumber.trim(),
    deliveryAddress: deliveryAddress.trim(),
    additionalNotes: additionalNotes?.trim() ?? "",
    requestId,
  };
}

function checkoutResponse(reservation) {
  return {
    checkoutUrl: reservation.checkoutUrl,
    amountMinor: reservation.amountMinor,
    currency: "bdt",
  };
}

export function createBookingsRouter(auth, stripe) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const createBooking = requirePermission("booking:create");
  const readOwnBookings = requirePermission("booking:read-own");
  const readOwnerBookings = requirePermission("booking:read-own-equipment");

  router.get("/", authenticate, readOwnBookings, async (request, response) => {
    if (!isAvailable(response)) {
      return;
    }

    const bookings = await Booking.find({ customerId: request.auth.userId })
      .sort({ createdAt: -1 })
      .lean();
    const equipmentIds = bookings.map((booking) => booking.equipmentId);
    const equipment = await Equipment.find({ _id: { $in: equipmentIds } })
      .select("name")
      .lean();
    const equipmentNames = new Map(
      equipment.map((item) => [item._id.toString(), item.name]),
    );

    return response.json({
      items: bookings.map((booking) => ({
        id: booking._id.toString(),
        equipmentName:
          equipmentNames.get(booking.equipmentId.toString()) ??
          "Equipment no longer available",
        startDate: booking.startDate,
        endDate: booking.endDate,
        bookingDate: booking.createdAt,
        amountMinor: booking.amountMinor,
        currency: "bdt",
        paymentStatus: booking.paymentStatus,
        bookingStatus: getBookingStatus(
          booking.startDate,
          booking.endDate,
        ),
      })),
    });
  });

  router.get(
    "/owner",
    authenticate,
    readOwnerBookings,
    async (request, response) => {
      if (!isAvailable(response)) {
        return;
      }

      const equipment = await Equipment.find({
        ownerId: request.auth.userId,
      })
        .select("name category")
        .lean();
      if (equipment.length === 0) {
        return response.json({ items: [] });
      }

      const equipmentById = new Map(
        equipment.map((item) => [
          item._id.toString(),
          {
            id: item._id.toString(),
            name: item.name,
            category: item.category,
          },
        ]),
      );
      const equipmentIds = equipment.map((item) => item._id);
      const now = new Date();
      const [bookings, reservations] = await Promise.all([
        Booking.find({ equipmentId: { $in: equipmentIds } })
          .sort({ createdAt: -1 })
          .lean(),
        BookingReservation.find({
          equipmentId: { $in: equipmentIds },
          status: "pending",
          expiresAt: { $gt: now },
        })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      const toOwnerRental = (rental, paymentStatus, bookingStatus) => {
        const equipmentId = rental.equipmentId.toString();
        const rentalEquipment = equipmentById.get(equipmentId);
        const durationDays = Math.max(
          1,
          Math.ceil(
            (new Date(rental.endDate).getTime() -
              new Date(rental.startDate).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        );

        return {
          id: rental._id.toString(),
          customer: {
            name: rental.customerName || "Customer",
            email: rental.customerEmail || "",
            phoneNumber: rental.contactNumber,
            address: rental.deliveryAddress,
          },
          equipment: rentalEquipment,
          startDate: rental.startDate,
          endDate: rental.endDate,
          durationDays,
          rentalType: rental.rentalType,
          quantity: rental.quantity,
          amountMinor: rental.amountMinor,
          currency: "bdt",
          paymentStatus,
          bookingStatus,
          bookingDate: rental.createdAt,
        };
      };

      const items = [
        ...bookings.map((booking) =>
          toOwnerRental(
            booking,
            booking.paymentStatus,
            getBookingStatus(booking.startDate, booking.endDate),
          ),
        ),
        ...reservations.map((reservation) =>
          toOwnerRental(reservation, "pending", "pending-payment"),
        ),
      ].sort(
        (first, second) =>
          new Date(second.bookingDate).getTime() -
          new Date(first.bookingDate).getTime(),
      );

      return response.json({ items });
    },
  );

  router.post(
    "/checkout",
    authenticate,
    createBooking,
    async (request, response) => {
      if (!stripe) {
        return response.status(503).json({
          message: "Stripe Checkout is not configured on the server.",
        });
      }
      if (!isAvailable(response)) {
        return;
      }

      const input = parseBookingInput(request.body);
      if (!input) {
        return response.status(400).json({
          message:
            "Provide valid equipment, dates, rental type, quantity, contact information, delivery address, and request ID.",
        });
      }
      if (input.startDate < getUtcStartOfDay()) {
        return response.status(400).json({
          message: "Rental start date cannot be in the past.",
        });
      }

      const existingReservation = await BookingReservation.findOne({
        customerId: request.auth.userId,
        requestId: input.requestId,
      });
      if (existingReservation) {
        if (
          existingReservation.status === "pending" &&
          existingReservation.expiresAt > new Date() &&
          existingReservation.checkoutUrl
        ) {
          return response.json(checkoutResponse(existingReservation));
        }
        return response.status(409).json({
          message: "This checkout request is no longer available. Please retry.",
        });
      }

      const equipment = await Equipment.findOne({
        _id: input.equipmentId,
        approvalStatus: "approved",
      })
        .select("name dailyRate rentalPrice rentalType quantity ownerId")
        .lean();
      if (!equipment || !(await isEquipmentOwnerActive(equipment.ownerId))) {
        return response.status(404).json({ message: "Equipment not found." });
      }

      let rentalPrice;
      try {
        rentalPrice = calculateRentalPrice({
          dailyRate: equipment.dailyRate,
          rentalType: input.rentalType,
          durationDays: input.durationDays,
          quantity: input.requiredQuantity,
          rentalPrice: equipment.rentalPrice,
          equipmentRentalType: equipment.rentalType,
        });
      } catch {
        return response.status(400).json({
          message: "The rental price could not be calculated.",
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + checkoutHoldMilliseconds);
      let reservation;
      try {
        reservation = await withEquipmentReservationLock(
          input.equipmentId,
          async () => {
            const availableQuantity = await getAvailableQuantity({
              equipmentId: equipment._id,
              totalQuantity: equipment.quantity ?? 1,
              startDate: input.startDate,
              endDate: input.endDate,
              now,
            });
            if (availableQuantity < input.requiredQuantity) {
              throw new InsufficientAvailabilityError(availableQuantity);
            }

            return BookingReservation.create({
              customerId: request.auth.userId,
              customerName: request.auth.name ?? "",
              customerEmail: request.auth.email ?? "",
              equipmentId: equipment._id,
              requestId: input.requestId,
              startDate: input.startDate,
              endDate: input.endDate,
              rentalType: input.rentalType,
              quantity: input.requiredQuantity,
              billedUnits: rentalPrice.billedUnits,
              unitAmountMinor: rentalPrice.unitAmountMinor,
              amountMinor: rentalPrice.amountMinor,
              contactNumber: input.contactNumber,
              deliveryAddress: input.deliveryAddress,
              additionalNotes: input.additionalNotes,
              expiresAt,
            });
          },
        );
      } catch (error) {
        if (error instanceof InsufficientAvailabilityError) {
          return response.status(409).json({
            message: error.message,
            availableQuantity: error.availableQuantity,
          });
        }
        if (error instanceof EquipmentReservationLockError) {
          return response.status(503).json({ message: error.message });
        }
        if (error?.code === 11000) {
          const duplicate = await BookingReservation.findOne({
            customerId: request.auth.userId,
            requestId: input.requestId,
          });
          if (duplicate?.checkoutUrl && duplicate.status === "pending") {
            return response.json(checkoutResponse(duplicate));
          }
          return response.status(409).json({
            message: "This checkout request is already being processed.",
          });
        }
        throw error;
      }

      const frontendUrl = (
        process.env.FRONTEND_URL || "http://localhost:3000"
      ).replace(/\/$/, "");
      const successUrl = `${new URL(
        "/payment/success",
        frontendUrl,
      ).toString()}?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = new URL(
        `/equipment/${encodeURIComponent(input.equipmentId)}`,
        frontendUrl,
      );

      let session;
      try {
        session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
              {
                quantity: rentalPrice.billedUnits * input.requiredQuantity,
                price_data: {
                  currency: "bdt",
                  unit_amount: rentalPrice.unitAmountMinor,
                  product_data: {
                    name: equipment.name,
                    description: `${input.rentalType} rental · ${rentalPrice.billedUnits} period(s)`,
                  },
                },
              },
            ],
            client_reference_id: request.auth.userId,
            metadata: {
              reservationId: reservation._id.toString(),
              customerId: request.auth.userId,
            },
            success_url: successUrl,
            cancel_url: cancelUrl.toString(),
            expires_at: Math.floor(expiresAt.getTime() / 1000),
          },
          { idempotencyKey: reservation._id.toString() },
        );
      } catch (error) {
        await BookingReservation.updateOne(
          { _id: reservation._id, status: "pending" },
          { $set: { status: "failed" } },
        );
        console.error("Stripe Checkout session creation failed:", error);
        return response.status(502).json({
          message: "Could not start secure checkout. Please try again.",
        });
      }

      if (!session.url) {
        await BookingReservation.updateOne(
          { _id: reservation._id, status: "pending" },
          { $set: { status: "failed" } },
        );
        return response.status(502).json({
          message: "Stripe did not return a secure checkout URL.",
        });
      }

      await BookingReservation.updateOne(
        { _id: reservation._id },
        {
          $set: {
            stripeSessionId: session.id,
            checkoutUrl: session.url,
          },
        },
      );

      return response.status(201).json({
        checkoutUrl: session.url,
        amountMinor: rentalPrice.amountMinor,
        currency: "bdt",
      });
    },
  );

  return router;
}
