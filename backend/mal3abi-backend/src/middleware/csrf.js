import { allowedOrigins } from "../config/cors.js";

function hasBearerToken(req) {
  const authorization = req.headers.authorization;
  return typeof authorization === "string" && /^Bearer\s+\S+/i.test(authorization);
}

/**
 * Strict CSRF protection for browser-based mutations.
 * Validates Origin/Referer headers against allowed frontend origins.
 * Bearer-token API clients are exempt because they do not rely on ambient cookies.
 * Cookie-based uploads are treated like any other browser mutation: custom headers
 * such as x-upload-request do not bypass the Origin/Referer check.
 */
export function csrfProtection(req, res, next) {
  const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutationMethods.includes(req.method)) {
    return next();
  }

  if (req.path === "/api/v1/payments/webhook" || req.originalUrl?.includes("/payments/webhook")) {
    return next();
  }

  if (hasBearerToken(req)) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const secFetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
  if (secFetchSite === "same-origin") {
    return next();
  }

  if (origin) {
    const normalizedOrigin = origin.trim().replace(/\/+$/, "");
    if (allowedOrigins.includes(normalizedOrigin)) {
      return next();
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      if (allowedOrigins.includes(refererOrigin)) {
        return next();
      }
    } catch {
      // Ignore malformed referer and fall through to the CSRF error.
    }
  }

  return res.status(403).json({
    message: "CSRF protection: Invalid or missing Origin/Referer header",
  });
}
