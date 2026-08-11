/**
 * Centralized environment configuration and validation.
 * - Browser: `NEXT_PUBLIC_API_URL` (e.g. `/api/v1` in prod when Nginx proxies API on the same host).
 * - SSR: Prefer `SERVER_API_URL` as an absolute URL to the Express API.
 * - Optional: `BACKEND_PROXY_TARGET` in Next (production only) — see `next.config.mjs` rewrites.
 * - Hostinger VPS fallback: when the public API is same-origin (`/api/v1`) and no SSR override is set,
 *   default to `http://127.0.0.1:4000/api/v1` so SSR can still reach Express behind Nginx.
 */

const isProd = process.env.NODE_ENV === "production";
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isAbsoluteHttpUrl(value: string | undefined) {
  return ABSOLUTE_HTTP_URL_RE.test(String(value || "").trim());
}

function resolveServerApiUrl() {
  if (process.env.SERVER_API_URL) return trimTrailingSlash(process.env.SERVER_API_URL);
  if (process.env.BACKEND_PROXY_TARGET) return `${trimTrailingSlash(process.env.BACKEND_PROXY_TARGET)}/api/v1`;
  if (isAbsoluteHttpUrl(process.env.NEXT_PUBLIC_API_URL)) return trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL as string);
  if (isProd) return "http://127.0.0.1:4000/api/v1";
  return "http://localhost:4000/api/v1";
}

export const config = {
  isProd,
  // For client-side requests (browser)
  // In dev, this can be relative because of Next.js rewrites.
  // In prod, it should ideally be absolute or explicitly set.
  apiBaseUrl: trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL || "/api/v1"),

  // For server-side requests (SSR)
  // MUST be absolute.
  serverApiUrl: resolveServerApiUrl(),

  accessTokenCookie: process.env.ACCESS_TOKEN_COOKIE || "mal3abi_access_token",
  refreshTokenCookie: process.env.REFRESH_TOKEN_COOKIE || "mal3abi_refresh_token",
};

/**
 * Validates critical production environment variables.
 * Should be called on application startup (e.g., in root layout).
 */
export function validateConfig() {
  if (!isProd) return;

  const missing = [];

  // In production we prefer an explicit SSR API URL, but same-host Hostinger deploys can safely
  // fall back to the internal Express origin on 127.0.0.1 when NEXT_PUBLIC_API_URL remains relative.

  if (process.env.SERVER_API_URL && !isAbsoluteHttpUrl(process.env.SERVER_API_URL)) {
    missing.push("SERVER_API_URL must be an absolute http(s) URL");
  }

  if (process.env.BACKEND_PROXY_TARGET && !isAbsoluteHttpUrl(process.env.BACKEND_PROXY_TARGET)) {
    missing.push("BACKEND_PROXY_TARGET must be an absolute http(s) URL");
  }

  if (missing.length > 0) {
    const errorMsg = `CRITICAL CONFIGURATION ERROR: The following environment variables are missing or invalid for production: ${missing.join(", ")}. SSR will fail.`;
    console.error(errorMsg);
    // In production, we want to fail fast if the environment is misconfigured
    if (typeof window === "undefined") {
      throw new Error(errorMsg);
    }
  }
}
