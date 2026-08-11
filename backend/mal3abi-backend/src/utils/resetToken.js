import crypto from "crypto";

/**
 * Generates a random reset token (raw) suitable to send to a user.
 * Store ONLY the hash of the token in DB.
 */
export function generateResetToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

/**
 * Hash a token (raw) before storing it in DB.
 */
export function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a presented raw token matches a stored hash.
 */
export function verifyResetToken(token, tokenHash) {
  if (!token || !tokenHash) return false;
  const hashed = hashResetToken(token);
  // timingSafeEqual requires equal length buffers
  const a = Buffer.from(hashed, "hex");
  const b = Buffer.from(tokenHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
