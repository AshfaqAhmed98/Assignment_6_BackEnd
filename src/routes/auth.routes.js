import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import mongoose from "mongoose";
import { User } from "../models/user.model.js";

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts. Try again later." },
});

router.post("/register", registrationRateLimit, async (request, response) => {
  const { name, email, photo, password } = request.body ?? {};

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 80
  ) {
    return response.status(400).json({
      message: "Enter a name between 1 and 80 characters.",
    });
  }

  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !emailPattern.test(email.trim())
  ) {
    return response.status(400).json({
      message: "Enter a valid email address.",
    });
  }

  if (typeof photo !== "string" || photo.trim().length > 2048) {
    return response.status(400).json({
      message: "Enter a valid profile photo URL.",
    });
  }

  let photoUrl;
  try {
    photoUrl = new URL(photo.trim());
  } catch {
    return response.status(400).json({
      message: "Enter a valid profile photo URL.",
    });
  }

  if (!["http:", "https:"].includes(photoUrl.protocol)) {
    return response.status(400).json({
      message: "Profile photo URL must use HTTP or HTTPS.",
    });
  }

  if (
    typeof password !== "string" ||
    password.length < 6 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password)
  ) {
    return response.status(400).json({
      message:
        "Password must be at least 6 characters, include uppercase and lowercase letters, and be no longer than 72 bytes.",
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return response.status(503).json({
      message: "Registration is temporarily unavailable.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await User.findOne({ email: normalizedEmail })
      .select("_id")
      .lean();

    if (existingUser) {
      return response.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      photo: photoUrl.toString(),
      passwordHash,
    });

    return response.status(201).json({
      message: "Account created successfully.",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        photo: user.photo,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return response.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    throw error;
  }
});

export default router;
