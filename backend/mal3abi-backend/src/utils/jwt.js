import jwt from "jsonwebtoken";

function getAccessSecret() {
  const secret = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("Missing JWT secret. Set JWT_SECRET (recommended) or JWT_ACCESS_SECRET.");
  }
  return secret;
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("Missing refresh JWT secret. Set JWT_REFRESH_SECRET.");
  }
  return secret;
}

export function signAccessToken(payload, customExpiresIn) {
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: customExpiresIn || process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRES_IN || "1h",
  });
}

export function verifyAccessToken(token, options = {}) {
  return jwt.verify(token, getAccessSecret(), options);
}

export function signRefreshToken(payload, customExpiresIn) {
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: customExpiresIn || process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
}

export function verifyRefreshToken(token, options = {}) {
  return jwt.verify(token, getRefreshSecret(), options);
}
