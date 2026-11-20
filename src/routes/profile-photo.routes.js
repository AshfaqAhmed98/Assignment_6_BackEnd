import { createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { requirePermission } from "../middleware/permissions.js";
import { requireJwt } from "../middleware/require-jwt.js";

const maxFileSize = 5 * 1024 * 1024;
const allowedImageTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const imageUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many image uploads. Try again later." },
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
  fileFilter(_request, file, callback) {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Choose a supported image file."));
      return;
    }

    callback(null, true);
  },
});

function parseImage(request, response, next) {
  upload.single("image")(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      const isTooLarge = error.code === "LIMIT_FILE_SIZE";
      return response.status(isTooLarge ? 413 : 400).json({
        message: isTooLarge
          ? "Images must be 5 MB or smaller."
          : "Upload one image file at a time.",
      });
    }

    if (error?.message === "Choose a supported image file.") {
      return response.status(400).json({ message: error.message });
    }

    if (error) {
      return next(error);
    }

    return next();
  });
}

class ImageProviderError extends Error {
  constructor(provider, message, statusCode = 502, cause) {
    super(message);
    this.name = "ImageProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

function getSecureImageUrl(value, provider) {
  if (typeof value !== "string") {
    throw new ImageProviderError(
      provider,
      `${provider} returned no image URL.`,
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new ImageProviderError(
      provider,
      `${provider} returned an invalid image URL.`,
      502,
      error,
    );
  }
  if (url.protocol !== "https:") {
    throw new ImageProviderError(
      provider,
      `${provider} returned an insecure image URL.`,
    );
  }
  return url.toString();
}

async function uploadToImgBB(file, { env, fetchImpl }) {
  const apiKey = env.IMGBB_API_KEY?.trim();
  if (!apiKey) {
    throw new ImageProviderError(
      "ImgBB",
      "ImgBB is not configured on the server.",
      503,
    );
  }

  const formData = new FormData();
  formData.append(
    "image",
    new Blob([file.buffer], { type: file.mime }),
    `image.${file.ext}`,
  );

  let response;
  try {
    response = await fetchImpl(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    throw new ImageProviderError(
      "ImgBB",
      "Could not connect to ImgBB.",
      502,
      error,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new ImageProviderError(
      "ImgBB",
      "ImgBB returned an invalid response.",
      502,
      error,
    );
  }

  if (!response.ok || result?.success !== true) {
    throw new ImageProviderError(
      "ImgBB",
      "ImgBB could not save this image.",
    );
  }

  return getSecureImageUrl(result?.data?.url, "ImgBB");
}

async function uploadToCloudinary(file, filenamePrefix, { env, fetchImpl, now }) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new ImageProviderError(
      "Cloudinary",
      "ImgBB is unavailable and the Cloudinary backup is not configured.",
      503,
    );
  }
  if (!/^[a-zA-Z0-9-]+$/.test(cloudName)) {
    throw new ImageProviderError(
      "Cloudinary",
      "The Cloudinary cloud name is invalid.",
      503,
    );
  }

  const timestamp = String(Math.floor(now() / 1000));
  const folder = "gearrent";
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([file.buffer], { type: file.mime }),
    `${filenamePrefix}.${file.ext}`,
  );
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("signature", signature);

  let response;
  try {
    response = await fetchImpl(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    throw new ImageProviderError(
      "Cloudinary",
      "Could not connect to Cloudinary.",
      502,
      error,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new ImageProviderError(
      "Cloudinary",
      "Cloudinary returned an invalid response.",
      502,
      error,
    );
  }

  if (!response.ok) {
    throw new ImageProviderError(
      "Cloudinary",
      "Cloudinary could not save this image.",
    );
  }

  return getSecureImageUrl(result?.secure_url, "Cloudinary");
}

export async function uploadImageWithFallback(
  file,
  filenamePrefix,
  { env = process.env, fetchImpl = fetch, now = Date.now } = {},
) {
  try {
    const url = await uploadToImgBB(file, { env, fetchImpl });
    return { url, provider: "imgbb" };
  } catch (primaryError) {
    try {
      const url = await uploadToCloudinary(file, filenamePrefix, {
        env,
        fetchImpl,
        now,
      });
      return { url, provider: "cloudinary" };
    } catch (backupError) {
      const statusCode = backupError?.statusCode === 503 ? 503 : 502;
      const message =
        statusCode === 503
          ? backupError?.message
          : "Image upload failed on both ImgBB and Cloudinary. Try again later.";
      const error = new ImageProviderError(
        "Image upload",
        message,
        statusCode,
        { primaryError, backupError },
      );
      throw error;
    }
  }
}

async function uploadImage(request, response, filenamePrefix) {
  if (!request.file) {
    return response.status(400).json({
      message: "Choose an image to upload.",
    });
  }

  const detectedType = await fileTypeFromBuffer(request.file.buffer);
  if (!detectedType || !allowedImageTypes.has(detectedType.mime)) {
    return response.status(400).json({
      message: "Upload a valid PNG, JPG, WEBP, or GIF image.",
    });
  }

  try {
    const result = await uploadImageWithFallback(
      {
        buffer: request.file.buffer,
        mime: detectedType.mime,
        ext: detectedType.ext,
      },
      filenamePrefix,
    );
    return response.status(201).json(result);
  } catch (error) {
    console.error("Image upload providers failed:", {
      message: error?.message,
      statusCode: error?.statusCode,
    });
    return response.status(error?.statusCode ?? 502).json({
      message: error?.message || "Image upload failed. Try again later.",
    });
  }
}

export function createUploadsRouter(auth) {
  const router = Router();
  const authenticate = requireJwt(auth);
  const createEquipment = requirePermission("equipment:create");

  router.post(
    "/profile-photo",
    imageUploadRateLimit,
    parseImage,
    (request, response) =>
      uploadImage(request, response, "profile"),
  );
  router.post(
    "/equipment-photo",
    authenticate,
    createEquipment,
    imageUploadRateLimit,
    parseImage,
    (request, response) =>
      uploadImage(request, response, "equipment"),
  );

  return router;
}
