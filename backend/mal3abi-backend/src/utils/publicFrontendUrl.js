import { allowedOrigins, normalizeOrigin } from "../config/cors.js";

function firstNonEmptyOrigin(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .find(Boolean);
}

export function getPublicFrontendUrl() {
  // ✅ Standardized to perfectly match cors.js
  return (
    firstNonEmptyOrigin(process.env.PUBLIC_FRONTEND_URL) ||
    firstNonEmptyOrigin(process.env.FRONTEND_URL) ||
    firstNonEmptyOrigin(process.env.CORS_ORIGIN) ||
    firstNonEmptyOrigin(process.env.CORS_ORIGINS) ||
    "http://localhost:3000"
  );
}

export function resolvePublicFrontendUrl(preferredOrigin) {
  const normalizedPreferredOrigin = normalizeOrigin(preferredOrigin);

  if (normalizedPreferredOrigin && allowedOrigins.includes(normalizedPreferredOrigin)) {
    return normalizedPreferredOrigin;
  }

  return getPublicFrontendUrl();
}
