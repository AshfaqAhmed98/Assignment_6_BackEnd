const rentalMultipliers = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const rentalTypes = new Set(Object.keys(rentalMultipliers));
const availabilityOptions = new Set(["all", "available", "unavailable"]);
const sortOptions = new Set([
  "recently-added",
  "price-low-to-high",
  "price-high-to-low",
]);

function readText(value, field, maxLength) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new Error(`${field} must be a string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function readPrice(value, field) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a non-negative number.`);
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizedValue)) {
    throw new Error(`${field} must be a non-negative number.`);
  }

  const price = Number(normalizedValue);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return price;
}

export function parseEquipmentListingQuery(query) {
  const search = readText(query.search, "Search", 120);
  const category = readText(query.category, "Category", 80);
  const rawRentalType = readText(query.rentalType, "Rental type", 10);
  const rawAvailability = readText(query.availability, "Availability", 12);
  const rawSort = readText(query.sort, "Sort", 32);
  const minPrice = readPrice(query.minPrice, "Minimum price");
  const maxPrice = readPrice(query.maxPrice, "Maximum price");
  const rentalType = rawRentalType || "daily";
  const availability = rawAvailability || "all";
  const sort = rawSort || "recently-added";

  if (!rentalTypes.has(rentalType)) {
    throw new Error("Rental type must be daily, weekly, or monthly.");
  }
  if (!availabilityOptions.has(availability)) {
    throw new Error("Availability must be all, available, or unavailable.");
  }
  if (!sortOptions.has(sort)) {
    throw new Error(
      "Sort must be recently-added, price-low-to-high, or price-high-to-low.",
    );
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new Error("Minimum price cannot exceed maximum price.");
  }

  return {
    search,
    category,
    rentalType,
    minPrice,
    maxPrice,
    availability,
    sort,
  };
}

export function createEquipmentListing({
  equipment,
  availableQuantities,
  options,
}) {
  const multiplier = rentalMultipliers[options.rentalType];
  const normalizedSearch = options.search.toLocaleLowerCase();
  const normalizedCategory = options.category.toLocaleLowerCase();

  const items = equipment
    .map((item) => {
      const id = item._id.toString();
      const totalQuantity = item.quantity ?? 1;
      const availableQuantity = availableQuantities.get(id);
      if (availableQuantity === undefined) {
        throw new Error(`Availability was not calculated for equipment ${id}.`);
      }

      return {
        id,
        name: item.name,
        category: item.category,
        location: item.location,
        dailyRate: item.dailyRate,
        rentalRate:
          item.rentalType === options.rentalType &&
          Number.isFinite(item.rentalPrice) &&
          item.rentalPrice > 0
            ? item.rentalPrice
            : item.dailyRate * multiplier,
        rentalType: options.rentalType,
        image: item.image,
        description: item.description,
        totalQuantity,
        availableQuantity,
        availabilityStatus:
          availableQuantity > 0 ? "available" : "unavailable",
        createdAt: item.createdAt,
      };
    })
    .filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLocaleLowerCase().includes(normalizedSearch) ||
        item.location.toLocaleLowerCase().includes(normalizedSearch);
      const matchesCategory =
        !normalizedCategory ||
        item.category.toLocaleLowerCase() === normalizedCategory;
      const matchesMinimum =
        options.minPrice === undefined || item.rentalRate >= options.minPrice;
      const matchesMaximum =
        options.maxPrice === undefined || item.rentalRate <= options.maxPrice;
      const matchesAvailability =
        options.availability === "all" ||
        item.availabilityStatus === options.availability;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesMinimum &&
        matchesMaximum &&
        matchesAvailability
      );
    });

  if (options.sort === "price-low-to-high") {
    items.sort((left, right) => left.rentalRate - right.rentalRate);
  } else if (options.sort === "price-high-to-low") {
    items.sort((left, right) => right.rentalRate - left.rentalRate);
  } else {
    items.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
  }

  return items.map(({ createdAt, ...item }) => item);
}
