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

async function uploadImageToImgBB(request, response, filenamePrefix) {
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

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    return response.status(503).json({
      message: "Image uploads are not configured on the server.",
    });
  }

  const formData = new FormData();
  formData.append(
    "image",
    new Blob([request.file.buffer], { type: detectedType.mime }),
    `${filenamePrefix}.${detectedType.ext}`,
  );

  let imgbbResponse;
  try {
    imgbbResponse = await fetch(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    if (error?.name === "TimeoutError") {
      return response.status(504).json({
        message: "Image upload timed out. Please try again.",
      });
    }

    return response.status(502).json({
      message: "Could not connect to the image upload service.",
    });
  }

  let result;
  try {
    result = await imgbbResponse.json();
  } catch {
    return response.status(502).json({
      message: "The image upload service returned an invalid response.",
    });
  }

  if (!imgbbResponse.ok || result?.success !== true) {
    return response.status(502).json({
      message: "The image upload service could not save this image.",
    });
  }

  const imageUrl = result?.data?.url;
  if (typeof imageUrl !== "string") {
    return response.status(502).json({
      message: "The image upload service returned no image URL.",
    });
  }

  return response.status(201).json({ url: imageUrl });
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
      uploadImageToImgBB(request, response, "profile"),
  );
  router.post(
    "/equipment-photo",
    authenticate,
    createEquipment,
    imageUploadRateLimit,
    parseImage,
    (request, response) =>
      uploadImageToImgBB(request, response, "equipment"),
  );

  return router;
}
