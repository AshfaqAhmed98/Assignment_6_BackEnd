import assert from "node:assert/strict";
import test from "node:test";
import { getFrontendOrigin } from "./frontend-origin.js";

test("normalizes the frontend URL to its origin", () => {
  assert.equal(
    getFrontendOrigin("https://gearrent-front.vercel.app/"),
    "https://gearrent-front.vercel.app",
  );
});

test("defaults to localhost and rejects non-HTTP frontend URLs", () => {
  assert.equal(getFrontendOrigin(""), "http://localhost:3000");
  assert.throws(
    () => getFrontendOrigin("ftp://gearrent-front.vercel.app"),
    /must use HTTP or HTTPS/,
  );
});
