import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { uploadImageWithFallback } from "./profile-photo.routes.js";

const imageFile = {
  buffer: Buffer.from("image-data"),
  mime: "image/jpeg",
  ext: "jpg",
};

function jsonResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

test("uses ImgBB first and returns its secure URL when available", async () => {
  const requests = [];
  const result = await uploadImageWithFallback(imageFile, "profile", {
    env: { IMGBB_API_KEY: "imgbb-key" },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        success: true,
        data: { url: "https://i.ibb.co/profile.jpg" },
      });
    },
  });

  assert.deepEqual(result, {
    url: "https://i.ibb.co/profile.jpg",
    provider: "imgbb",
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^https:\/\/api\.imgbb\.com\//);
});

test("falls back to signed Cloudinary upload when ImgBB fails", async () => {
  const requests = [];
  const result = await uploadImageWithFallback(imageFile, "profile", {
    env: {
      IMGBB_API_KEY: "imgbb-key",
      CLOUDINARY_CLOUD_NAME: "gearrent",
      CLOUDINARY_API_KEY: "cloudinary-key",
      CLOUDINARY_API_SECRET: "cloudinary-secret",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) {
        return jsonResponse({ success: false }, false);
      }
      return jsonResponse({
        secure_url:
          "https://res.cloudinary.com/gearrent/image/upload/profile.jpg",
      });
    },
    now: () => 1_700_000_000_000,
  });

  assert.deepEqual(result, {
    url: "https://res.cloudinary.com/gearrent/image/upload/profile.jpg",
    provider: "cloudinary",
  });
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /^https:\/\/api\.cloudinary\.com\/v1_1\/gearrent\//);
  const formData = requests[1].options.body;
  assert.equal(formData.get("api_key"), "cloudinary-key");
  assert.equal(formData.get("timestamp"), "1700000000");
  assert.equal(
    formData.get("signature"),
    createHash("sha1")
      .update(
        "folder=gearrent&timestamp=1700000000cloudinary-secret",
      )
      .digest("hex"),
  );
});

test("returns a configuration error when the Cloudinary backup is missing", async () => {
  await assert.rejects(
    uploadImageWithFallback(imageFile, "profile", {
      env: { IMGBB_API_KEY: "imgbb-key" },
      fetchImpl: async () => jsonResponse({ success: false }, false),
    }),
    {
      message:
        "ImgBB is unavailable and the Cloudinary backup is not configured.",
      statusCode: 503,
    },
  );
});
