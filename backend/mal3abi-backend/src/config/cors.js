export function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function parseOrigins(...values) {
  return [...new Set(values.flatMap((value) => String(value || "").split(",")).map(normalizeOrigin).filter(Boolean))];
}

const parsedOrigins = parseOrigins(
  process.env.FRONTEND_URL,
  process.env.PUBLIC_FRONTEND_URL,
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGINS,
  process.env.NODE_ENV === "test" ? "http://localhost:3000" : undefined,
);

// ✅ Allow origins from all supported env names instead of only the first populated one.
export const allowedOrigins = parsedOrigins.length > 0 ? parsedOrigins : ["http://localhost:3000"];
