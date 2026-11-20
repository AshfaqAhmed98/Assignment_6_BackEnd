import { Router } from "express";
import mongoose from "mongoose";
import { requirePermission } from "../middleware/permissions.js";
import { requireJwt } from "../middleware/require-jwt.js";
import { Booking } from "../models/booking.model.js";
import { BookingReservation } from "../models/booking-reservation.model.js";
import { BookingReservationLock } from "../models/booking-reservation-lock.model.js";
import { Equipment } from "../models/equipment.model.js";
import { Favorite } from "../models/favorite.model.js";
import { Payment } from "../models/payment.model.js";
import { getBookingStatus } from "../services/booking-status.js";
import {
  accountStatuses,
  normalizeAccountStatus,
} from "../services/account-status.js";
import {
  permanentlyDeleteUserData,
  PermanentUserDeletionError,
} from "../services/permanent-user-deletion.js";

const userRoles = new Set(["Customer", "Owner", "Admin"]);
const accountStatusSet = new Set(accountStatuses);
const dayMilliseconds = 24 * 60 * 60 * 1000;

function isAvailable(response) {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  response.status(503).json({
    message: "Admin services are temporarily unavailable.",
  });
  return false;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseAdminUserQuery(query) {
  const rawLimit = query.limit === undefined ? "50" : String(query.limit);
  const rawOffset = query.offset === undefined ? "0" : String(query.offset);
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  const search = query.search === undefined ? "" : query.search;
  const role = query.role;
  const accountStatus = query.status;

  if (
    !/^\d+$/.test(rawLimit) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !/^\d+$/.test(rawOffset) ||
    !Number.isSafeInteger(offset) ||
    typeof search !== "string" ||
    search.trim().length > 100 ||
    (role !== undefined && role !== "" && !userRoles.has(role)) ||
    (accountStatus !== undefined &&
      accountStatus !== "" &&
      !accountStatusSet.has(accountStatus))
  ) {
    return null;
  }

  const clauses = [];
  if (search.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    clauses.push({ $or: [{ name: pattern }, { email: pattern }] });
  }
  if (role) {
    clauses.push({ role });
  }
  if (accountStatus === "active") {
    clauses.push({
      $or: [
        { accountStatus: "active" },
        { accountStatus: { $exists: false } },
      ],
    });
  } else if (accountStatus) {
    clauses.push({ accountStatus });
  }

  return {
    limit,
    offset,
    filter:
      clauses.length > 1
        ? { $and: clauses }
        : clauses[0] ?? {},
  };
}

export function parseUserRoleUpdate(body) {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !userRoles.has(body.role)
  ) {
    return null;
  }
  return body.role;
}

function toUserResponse(user) {
  return {
    id: String(user._id),
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
    role: user.role ?? "Customer",
    accountStatus: normalizeAccountStatus(user.accountStatus),
    createdAt: user.createdAt ?? null,
  };
}

export function parseAccountStatusUpdate(body) {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !accountStatusSet.has(body.accountStatus)
  ) {
    return null;
  }
  return body.accountStatus;
}

export function isPermanentDeleteConfirmation(body, email) {
  return (
    typeof body?.confirmationEmail === "string" &&
    typeof email === "string" &&
    body.confirmationEmail.trim().toLowerCase() === email.trim().toLowerCase()
  );
}

function toEquipmentResponse(item) {
  return {
    id: item._id.toString(),
    name: item.name,
    category: item.category,
    location: item.location,
    dailyRate: item.dailyRate,
    rentalPrice: item.rentalPrice ?? item.dailyRate,
    rentalType: item.rentalType ?? "daily",
    quantity: item.quantity ?? 1,
    image: item.image,
    description: item.description,
    condition: item.condition ?? "",
    brand: item.brand ?? "",
    model: item.model ?? "",
    rentalTerms: item.rentalTerms ?? "",
    approvalStatus: item.approvalStatus,
    ownerId: item.ownerId ?? "",
    ownerName: item.ownerName ?? "",
  };
}

function toRentalResponse(rental, type, equipment, users) {
  const equipmentId = rental.equipmentId.toString();
  const item = equipment.get(equipmentId);
  const customer = users.get(rental.customerId);
  const durationDays = Math.max(
    1,
    Math.ceil(
      (new Date(rental.endDate).getTime() -
        new Date(rental.startDate).getTime()) /
        dayMilliseconds,
    ),
  );
  const isReservation = type === "reservation";

  return {
    id: rental._id.toString(),
    recordType: type,
    customer: {
      id: rental.customerId,
      name:
        rental.customerName ||
        customer?.name ||
        "Customer",
      email: rental.customerEmail || customer?.email || "",
      phoneNumber: rental.contactNumber ?? "",
      address: rental.deliveryAddress ?? "",
    },
    owner: {
      id: item?.ownerId ?? "",
      name: item?.ownerName || "Owner",
      email: item?.ownerId ? users.get(item.ownerId)?.email ?? "" : "",
    },
    equipment: {
      id: equipmentId,
      name: item?.name ?? "Equipment no longer available",
      category: item?.category ?? "",
    },
    startDate: rental.startDate,
    endDate: rental.endDate,
    durationDays,
    rentalType: rental.rentalType,
    quantity: rental.quantity,
    amountMinor: rental.amountMinor,
    currency: "bdt",
    paymentStatus: isReservation ? "pending" : rental.paymentStatus,
    bookingStatus: isReservation
      ? "pending-payment"
      : getBookingStatus(rental.startDate, rental.endDate),
    bookingDate: rental.createdAt,
  };
}

export function createAdminRouter(auth, stripe) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const manageAdmin = requirePermission("admin:manage");
  const userCollection = () =>
    mongoose.connection.getClient().db().collection("user");
  const adminOnly = [authenticate, manageAdmin];

  router.get("/users", ...adminOnly, async (request, response) => {
    if (!isAvailable(response)) {
      return;
    }
    const query = parseAdminUserQuery(request.query);
    if (!query) {
      return response.status(400).json({
        message: "Provide valid user search, role, limit, and offset values.",
      });
    }

    const [users, total] = await Promise.all([
      userCollection()
        .find(query.filter, {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
            role: 1,
            accountStatus: 1,
            createdAt: 1,
          },
        })
        .sort({ createdAt: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .toArray(),
      userCollection().countDocuments(query.filter),
    ]);

    return response.json({
      items: users.map(toUserResponse),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  router.patch(
    "/users/:id/role",
    ...adminOnly,
    async (request, response) => {
      if (!isAvailable(response)) {
        return;
      }
      const role = parseUserRoleUpdate(request.body);
      if (!role) {
        return response.status(400).json({
          message: "Role must be Customer, Owner, or Admin.",
        });
      }
      if (request.params.id === request.auth.userId) {
        return response.status(409).json({
          message: "You cannot change your own role.",
        });
      }

      const collection = userCollection();
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "User not found." });
      }
      const userId = new mongoose.Types.ObjectId(request.params.id);
      const target = await collection.findOne(
        { _id: userId },
        { projection: { role: 1, accountStatus: 1 } },
      );
      if (!target) {
        return response.status(404).json({ message: "User not found." });
      }
      if (normalizeAccountStatus(target.accountStatus) !== "active") {
        return response.status(409).json({
          message: "Restore this account before changing its role.",
        });
      }
      if (
        target.role === "Admin" &&
        role !== "Admin" &&
        (await collection.countDocuments({ role: "Admin" })) <= 1
      ) {
        return response.status(409).json({
          message: "The last Admin account cannot be demoted.",
        });
      }

      await collection.updateOne(
        { _id: userId },
        { $set: { role, updatedAt: new Date() } },
      );
      const updated = await collection.findOne(
        { _id: userId },
        {
          projection: {
            name: 1,
            email: 1,
            role: 1,
            accountStatus: 1,
            createdAt: 1,
          },
        },
      );
      if (!updated) {
        return response.status(404).json({ message: "User not found." });
      }
      return response.json({ item: toUserResponse(updated) });
    },
  );

  router.patch(
    "/users/:id/status",
    ...adminOnly,
    async (request, response) => {
      const accountStatus = parseAccountStatusUpdate(request.body);
      if (!accountStatus) {
        return response.status(400).json({
          message: "Account status must be active, suspended, or deleted.",
        });
      }
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "User not found." });
      }
      if (!isAvailable(response)) {
        return;
      }

      const userId = new mongoose.Types.ObjectId(request.params.id);
      const collection = userCollection();
      const target = await collection.findOne(
        { _id: userId },
        {
          projection: {
            role: 1,
            accountStatus: 1,
            permanentDeletionState: 1,
          },
        },
      );
      if (!target) {
        return response.status(404).json({ message: "User not found." });
      }
      if (target.permanentDeletionState) {
        return response.status(409).json({
          message:
            "Permanent deletion has already started. This account cannot be restored.",
        });
      }

      const currentStatus = normalizeAccountStatus(target.accountStatus);
      if (
        request.params.id === request.auth.userId &&
        accountStatus !== currentStatus
      ) {
        return response.status(409).json({
          message: "You cannot suspend, delete, or restore your own account.",
        });
      }
      if (
        target.role === "Admin" &&
        currentStatus === "active" &&
        accountStatus !== "active" &&
        (await collection.countDocuments({
          role: "Admin",
          $or: [
            { accountStatus: "active" },
            { accountStatus: { $exists: false } },
          ],
        })) <= 1
      ) {
        return response.status(409).json({
          message: "The last active Admin account cannot be suspended or deleted.",
        });
      }

      await collection.updateOne(
        { _id: userId },
        { $set: { accountStatus, updatedAt: new Date() } },
      );

      if (accountStatus !== "active") {
        try {
          await mongoose.connection
            .getClient()
            .db()
            .collection("session")
            .deleteMany({ userId: { $in: [request.params.id, userId] } });
        } catch (error) {
          console.error(
            "Could not revoke sessions after changing an account status:",
            error,
          );
          return response.status(503).json({
            message:
              "The account status was updated, but existing sessions could not be revoked. Retry the action.",
          });
        }
      }

      const updated = await collection.findOne(
        { _id: userId },
        {
          projection: {
            name: 1,
            email: 1,
            role: 1,
            accountStatus: 1,
            createdAt: 1,
          },
        },
      );
      if (!updated) {
        return response.status(404).json({ message: "User not found." });
      }
      return response.json({ item: toUserResponse(updated) });
    },
  );

  router.delete(
    "/users/:id/permanent",
    ...adminOnly,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({ message: "User not found." });
      }
      if (!isAvailable(response)) {
        return;
      }
      if (request.params.id === request.auth.userId) {
        return response.status(409).json({
          message: "You cannot permanently delete your own account.",
        });
      }

      const userId = new mongoose.Types.ObjectId(request.params.id);
      const target = await userCollection().findOne(
        { _id: userId },
        {
          projection: {
            email: 1,
            role: 1,
            accountStatus: 1,
            permanentDeletionState: 1,
          },
        },
      );
      if (!target) {
        return response.status(404).json({ message: "User not found." });
      }
      if (normalizeAccountStatus(target.accountStatus) !== "deleted") {
        return response.status(409).json({
          message:
            "Mark this account as deleted first. Permanent deletion is only available for deleted accounts.",
        });
      }
      if (!isPermanentDeleteConfirmation(request.body, target.email)) {
        return response.status(400).json({
          message:
            "Enter the account's exact email address to confirm permanent deletion.",
        });
      }

      const claim = await userCollection().updateOne(
        {
          _id: userId,
          accountStatus: "deleted",
          permanentDeletionState: { $ne: "in_progress" },
        },
        {
          $set: {
            permanentDeletionState: "in_progress",
            permanentDeletionStartedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );
      if (claim.matchedCount !== 1) {
        return response.status(409).json({
          message:
            "This account is being permanently deleted or its status changed. Refresh the user list and try again.",
        });
      }

      try {
        await permanentlyDeleteUserData({
          userId,
          email: target.email,
          database: mongoose.connection.getClient().db(),
          stripe,
          models: {
            Booking,
            BookingReservation,
            BookingReservationLock,
            Equipment,
            Favorite,
            Payment,
          },
        });
      } catch (error) {
        console.error("Permanent user deletion failed:", error?.message);
        const deletionStateUpdate =
          error instanceof PermanentUserDeletionError && error.safeToRestore
            ? {
                $unset: {
                  permanentDeletionState: "",
                  permanentDeletionStartedAt: "",
                },
              }
            : {
                $set: {
                  permanentDeletionState: "failed",
                  updatedAt: new Date(),
                },
              };
        try {
          await userCollection().updateOne(
            {
              _id: userId,
              permanentDeletionState: "in_progress",
            },
            deletionStateUpdate,
          );
        } catch (stateError) {
          console.error(
            "Could not update permanent deletion state:",
            stateError?.message,
          );
        }
        const statusCode =
          error instanceof PermanentUserDeletionError
            ? error.statusCode
            : 503;
        return response.status(statusCode).json({
          message:
            error?.message ||
            "Permanent deletion could not be completed. Verify the account before retrying.",
        });
      }

      return response.json({
        message:
          "The account and its linked local data were permanently deleted. Stripe records were not changed.",
      });
    },
  );

  router.get("/equipment", ...adminOnly, async (_request, response) => {
    if (!isAvailable(response)) {
      return;
    }
    const equipment = await Equipment.find({})
      .sort({ createdAt: -1 })
      .lean();
    return response.json({ items: equipment.map(toEquipmentResponse) });
  });

  router.get("/rentals", ...adminOnly, async (_request, response) => {
    if (!isAvailable(response)) {
      return;
    }
    const now = new Date();
    const [bookings, reservations] = await Promise.all([
      Booking.find({}).sort({ createdAt: -1 }).lean(),
      BookingReservation.find({
        status: "pending",
        expiresAt: { $gt: now },
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    const rentals = [
      ...bookings.map((item) => ({ item, type: "booking" })),
      ...reservations.map((item) => ({ item, type: "reservation" })),
    ];
    const equipmentIds = [
      ...new Set(rentals.map(({ item }) => item.equipmentId.toString())),
    ];
    const customerIds = [
      ...new Set(rentals.map(({ item }) => item.customerId)),
    ];
    const [equipmentItems, users] = await Promise.all([
      Equipment.find({ _id: { $in: equipmentIds } })
        .select("name category ownerId ownerName")
        .lean(),
      customerIds.length
        ? userCollection()
            .find(
              {
                _id: {
                  $in: customerIds
                    .filter((id) => mongoose.isValidObjectId(id))
                    .map((id) => new mongoose.Types.ObjectId(id)),
                },
              },
              { projection: { name: 1, email: 1 } },
            )
            .toArray()
        : [],
    ]);
    const equipmentById = new Map(
      equipmentItems.map((item) => [item._id.toString(), item]),
    );
    const ownerIds = [
      ...new Set(
        equipmentItems
          .map((item) => item.ownerId)
          .filter((id) => typeof id === "string" && id.length > 0),
      ),
    ];
    const owners = ownerIds.length
      ? await userCollection()
          .find(
            {
              _id: {
                $in: ownerIds
                  .filter((id) => mongoose.isValidObjectId(id))
                  .map((id) => new mongoose.Types.ObjectId(id)),
              },
            },
            { projection: { name: 1, email: 1 } },
          )
          .toArray()
      : [];
    const usersById = new Map(
      users.map((user) => [user._id.toString(), user]),
    );
    for (const owner of owners) {
      usersById.set(owner._id.toString(), owner);
    }

    return response.json({
      items: rentals
        .map(({ item, type }) =>
          toRentalResponse(item, type, equipmentById, usersById),
        )
        .sort(
          (first, second) =>
            new Date(second.bookingDate).getTime() -
            new Date(first.bookingDate).getTime(),
        ),
    });
  });

  router.patch(
    "/rentals/reservations/:id/cancel",
    ...adminOnly,
    async (request, response) => {
      if (!mongoose.isValidObjectId(request.params.id)) {
        return response.status(404).json({
          message: "Pending checkout reservation not found.",
        });
      }
      if (!isAvailable(response)) {
        return;
      }

      const reservation = await BookingReservation.findById(
        request.params.id,
      ).lean();
      if (!reservation) {
        return response.status(404).json({
          message: "Pending checkout reservation not found.",
        });
      }
      if (
        reservation.status !== "pending" ||
        reservation.expiresAt <= new Date()
      ) {
        return response.status(409).json({
          message: "Only an active pending checkout can be cancelled.",
        });
      }
      if (!stripe || !reservation.stripeSessionId) {
        return response.status(503).json({
          message: "Checkout cancellation is unavailable right now.",
        });
      }

      try {
        await stripe.checkout.sessions.expire(reservation.stripeSessionId);
      } catch (error) {
        if (error?.code === "resource_missing") {
          return response.status(409).json({
            message: "The Stripe checkout session no longer exists.",
          });
        }
        if (error?.code === "checkout_session_async_payment_pending") {
          return response.status(409).json({
            message:
              "This checkout has a payment in progress and cannot be cancelled.",
          });
        }
        if (error?.code === "checkout_session_not_open") {
          return response.status(409).json({
            message:
              "This checkout is no longer open. Refresh rentals to see its latest status.",
          });
        }
        throw error;
      }

      const cancelled = await BookingReservation.findOneAndUpdate(
        {
          _id: reservation._id,
          status: "pending",
          expiresAt: { $gt: new Date() },
        },
        { $set: { status: "cancelled" } },
        { new: true, runValidators: true },
      ).lean();
      if (!cancelled) {
        return response.status(409).json({
          message: "This checkout has already changed and cannot be cancelled.",
        });
      }
      return response.json({
        item: {
          id: cancelled._id.toString(),
          status: cancelled.status,
        },
      });
    },
  );

  return router;
}
