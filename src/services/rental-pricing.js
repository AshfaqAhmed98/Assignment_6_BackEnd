const millisecondsPerDay = 24 * 60 * 60 * 1000;

const rentalPeriods = Object.freeze({
  daily: 1,
  weekly: 7,
  monthly: 30,
});

export function getUtcStartOfDay(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function getDhakaStartOfDay(date = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .filter((part) => ["year", "month", "day"].includes(part.type));
  const dateValues = Object.fromEntries(
    dateParts.map(({ type, value }) => [type, value]),
  );

  return new Date(
    `${dateValues.year}-${dateValues.month}-${dateValues.day}T00:00:00.000Z`,
  );
}

export function parseRentalDateRange(startDateValue, endDateValue) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    typeof startDateValue !== "string" ||
    typeof endDateValue !== "string" ||
    !datePattern.test(startDateValue) ||
    !datePattern.test(endDateValue)
  ) {
    throw new Error("Provide valid rental start and end dates.");
  }

  const startDate = new Date(`${startDateValue}T00:00:00.000Z`);
  const requestedEndDate = new Date(`${endDateValue}T00:00:00.000Z`);
  if (
    startDate.toISOString().slice(0, 10) !== startDateValue ||
    requestedEndDate.toISOString().slice(0, 10) !== endDateValue
  ) {
    throw new Error("Provide valid rental start and end dates.");
  }
  if (requestedEndDate < startDate) {
    throw new Error("The rental end date must be on or after the start date.");
  }

  const durationDays = Math.max(
    1,
    Math.round((requestedEndDate.getTime() - startDate.getTime()) / millisecondsPerDay),
  );
  const endDate = new Date(startDate.getTime() + durationDays * millisecondsPerDay);

  return { startDate, endDate, durationDays };
}

export function calculateRentalPrice({
  dailyRate,
  rentalType,
  durationDays,
  quantity,
  rentalPrice,
  equipmentRentalType,
}) {
  const periodDays = rentalPeriods[rentalType];
  if (
    !Number.isFinite(dailyRate) ||
    dailyRate <= 0 ||
    !periodDays ||
    !Number.isInteger(durationDays) ||
    durationDays < 1 ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new Error("Rental pricing inputs are invalid.");
  }

  const billedUnits = Math.ceil(durationDays / periodDays);
  const usesExactPeriodRate =
    rentalType === equipmentRentalType &&
    Number.isFinite(rentalPrice) &&
    rentalPrice > 0;
  const unitAmountMinor = usesExactPeriodRate
    ? Math.round(rentalPrice * 100)
    : Math.round(dailyRate * 100) * periodDays;
  const amountMinor = unitAmountMinor * billedUnits * quantity;

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("The calculated rental amount is invalid.");
  }

  return {
    billedUnits,
    periodDays,
    unitAmountMinor,
    amountMinor,
    totalAmount: amountMinor / 100,
  };
}

export function countAvailableQuantity(totalQuantity, occupiedQuantities) {
  if (!Number.isInteger(totalQuantity) || totalQuantity < 0) {
    throw new Error("Equipment quantity is invalid.");
  }
  const occupied = occupiedQuantities.reduce(
    (total, quantity) =>
      Number.isInteger(quantity) && quantity > 0 ? total + quantity : total,
    0,
  );
  return Math.max(0, totalQuantity - occupied);
}
