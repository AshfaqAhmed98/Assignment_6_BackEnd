const defaultFrontendUrl = "http://localhost:3000";

export function getFrontendOrigin(frontendUrl = process.env.FRONTEND_URL) {
  const configuredUrl =
    typeof frontendUrl === "string" && frontendUrl.trim()
      ? frontendUrl.trim()
      : defaultFrontendUrl;

  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("FRONTEND_URL must be a valid absolute HTTP(S) URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("FRONTEND_URL must use HTTP or HTTPS.");
  }

  return url.origin;
}
