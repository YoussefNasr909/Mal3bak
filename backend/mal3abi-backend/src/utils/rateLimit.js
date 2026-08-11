import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const TEST_BYPASS = (req, res, next) => next();

export const GLOBAL_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const AUTH_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: "Too many attempts from this IP, please try again after 15 minutes.",
  },
});

export const RESET_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    message: "Too many password reset requests, please try again after an hour.",
  },
});

export const REFRESH_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: {
    message: "Too many session refresh requests, please slow down.",
  },
});

export const BOOKING_VERIFY_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    message: "Too many check-in verification attempts, please slow down.",
  },
});

export const PUBLIC_AVAILABILITY_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    message: "Too many public availability checks from this IP, please slow down.",
  },
});

export const AVATAR_UPLOAD_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many avatar uploads, please wait before trying again.",
  },
  keyGenerator(req) {
    const requestIp = getRateLimitKeyIp(req);
    const userId = req.user?.id || "anonymous";
    return `avatar:${requestIp}:${userId}`;
  },
});

export const IMAGE_UPLOAD_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    message: "Too many image uploads, please wait before trying again.",
  },
  keyGenerator(req) {
    const requestIp = getRateLimitKeyIp(req);
    const userId = req.user?.id || "anonymous";
    return `images:${requestIp}:${userId}`;
  },
});

function normalizeIp(ip) {
  const value = String(ip || "").trim().toLowerCase();

  if (!value) return "";
  if (value === "localhost") return "127.0.0.1";
  if (value === "::1" || value === "0:0:0:0:0:0:0:1") return "127.0.0.1";
  if (value.startsWith("::ffff:")) return value.slice(7);

  return value;
}

function getRateLimitKeyIp(req) {
  const rawIp = req.ip || req.socket?.remoteAddress || "";
  const normalizedIp = normalizeIp(rawIp) || rawIp;
  return normalizedIp ? ipKeyGenerator(normalizedIp) : "unknown";
}

function getConfiguredSkipIps() {
  const configuredIps = String(process.env.RATE_LIMIT_SKIP_IPS || "")
    .split(",")
    .map((item) => normalizeIp(item))
    .filter(Boolean);

  return new Set(configuredIps);
}

export function shouldSkipRateLimit(req) {
  const requestIp = normalizeIp(req.ip || req.socket?.remoteAddress);

  if (!requestIp) return false;

  // Only auto-skip localhost in development/test to avoid bypassing rate limits
  // on production deployments where the proxy forwards as 127.0.0.1.
  if (requestIp === "127.0.0.1" && process.env.NODE_ENV !== "production") return true;

  return getConfiguredSkipIps().has(requestIp);
}

export function createRateLimiter(options) {
  if (process.env.NODE_ENV === "test") return TEST_BYPASS;

  const { skip, ...rest } = options;

  return rateLimit({
    ...rest,
    skip(req, res) {
      if (shouldSkipRateLimit(req)) return true;
      return typeof skip === "function" ? skip(req, res) : false;
    },
  });
}

export { getRateLimitKeyIp, normalizeIp };
