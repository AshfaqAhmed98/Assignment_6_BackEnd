import "dotenv/config";
import { createInterface } from "node:readline/promises";
import mongoose from "mongoose";
import { connectToDatabase } from "../config/database.js";
import { Equipment } from "../models/equipment.model.js";
import { ownerEquipmentSeed } from "../data/owner-equipment-seed.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArguments(args) {
  const emailIndex = args.indexOf("--email");
  const email = emailIndex >= 0 ? args[emailIndex + 1]?.trim() : "";
  const apply = args.includes("--apply");
  const allowedArguments = new Set(["--email", email, ...(apply ? ["--apply"] : [])]);
  const unknownArguments = args.filter((argument) => !allowedArguments.has(argument));

  if (
    !emailPattern.test(email) ||
    unknownArguments.length > 0 ||
    (emailIndex >= 0 && args.indexOf("--email", emailIndex + 1) >= 0)
  ) {
    throw new Error(
      "Usage: npm run seed:owner-equipment -- --email <owner-email> [--apply]",
    );
  }

  return { email: email.toLowerCase(), apply };
}

async function confirmInsert(count) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Apply mode requires an interactive terminal for confirmation.");
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await prompt.question(
      `Type CREATE ${count} to insert these pending listings: `,
    );
    return answer === `CREATE ${count}`;
  } finally {
    prompt.close();
  }
}

async function seedOwnerEquipment() {
  const { email, apply } = parseArguments(process.argv.slice(2));
  await connectToDatabase();

  try {
    const userCollection = mongoose.connection.getClient().db().collection("user");
    const owner = await userCollection.findOne(
      { email },
      { projection: { _id: 1, name: 1, role: 1 } },
    );

    if (!owner || owner.role !== "Owner") {
      throw new Error("No Owner account was found for the supplied email.");
    }

    const ownerId = owner._id.toString();
    const seedNames = ownerEquipmentSeed.map((listing) => listing.name);
    const existingListings = await Equipment.find({
      ownerId,
      name: { $in: seedNames },
    })
      .select("name")
      .lean();
    const existingNames = new Set(existingListings.map((listing) => listing.name));
    const listingsToCreate = ownerEquipmentSeed.filter(
      (listing) => !existingNames.has(listing.name),
    );

    console.log(
      `${listingsToCreate.length} new listings will be added; ${existingNames.size} matching names already exist.`,
    );
    for (const listing of listingsToCreate) {
      console.log(`- ${listing.name}`);
    }

    if (listingsToCreate.length === 0) {
      return;
    }

    if (!apply) {
      console.log(
        "Dry run only. Add --apply to review and confirm the database insert.",
      );
      return;
    }

    if (!(await confirmInsert(listingsToCreate.length))) {
      console.log("No listings were inserted.");
      return;
    }

    const createdListings = await Equipment.insertMany(
      listingsToCreate.map((listing) => ({
        ...listing,
        ownerId,
        ownerName: owner.name || "",
      })),
      { ordered: true },
    );
    console.log(
      `Created ${createdListings.length} pending listings. An Admin must approve them before they appear publicly.`,
    );
    console.log(
      "The included image paths use existing generic site banners; replace them with item photos from the owner dashboard.",
    );
  } finally {
    await mongoose.disconnect();
  }
}

seedOwnerEquipment().catch((error) => {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred.";
  console.error(`Owner equipment seeding failed: ${message}`);
  process.exitCode = 1;
});
