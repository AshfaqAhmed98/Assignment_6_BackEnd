import mongoose from "mongoose";

export const accountStatuses = Object.freeze([
  "active",
  "suspended",
  "deleted",
]);

const accountStatusSet = new Set(accountStatuses);

export function normalizeAccountStatus(status) {
  if (status === undefined) {
    return "active";
  }
  return accountStatusSet.has(status) ? status : "deleted";
}

export function isAccountStatusActive(status) {
  return status === undefined || status === "active";
}

export async function getInactiveOwnerIds(ownerIds) {
  const validIds = [
    ...new Set(
      ownerIds.filter(
        (id) => typeof id === "string" && mongoose.isValidObjectId(id),
      ),
    ),
  ];
  if (validIds.length === 0) {
    return new Set();
  }

  const users = await mongoose
    .connection
    .getClient()
    .db()
    .collection("user")
    .find(
      {
        _id: {
          $in: validIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      },
      { projection: { _id: 1, accountStatus: 1 } },
    )
    .toArray();

  return new Set(
    users
      .filter((user) => !isAccountStatusActive(user.accountStatus))
      .map((user) => user._id.toString()),
  );
}

export async function isEquipmentOwnerActive(ownerId) {
  if (!ownerId || !mongoose.isValidObjectId(ownerId)) {
    return true;
  }
  const inactiveOwnerIds = await getInactiveOwnerIds([ownerId]);
  return !inactiveOwnerIds.has(ownerId);
}

export async function filterActiveOwnerEquipment(items) {
  const inactiveOwnerIds = await getInactiveOwnerIds(
    items.map((item) => item.ownerId),
  );
  return items.filter(
    (item) =>
      !item.ownerId ||
      (typeof item.ownerId === "string" &&
        !inactiveOwnerIds.has(item.ownerId)),
  );
}
