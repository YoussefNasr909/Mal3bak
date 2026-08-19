/**
 * Strip non-digits for storage and uniqueness (Egypt + international formats).
 */
export function normalizePhone(input) {
  if (input == null) return "";
  return String(input).replace(/\D/g, "");
}

export function isValidPhoneDigits(digits) {
  return typeof digits === "string" && digits.length >= 10 && digits.length <= 15;
}

/** Manager manual bookings accept Egyptian local or international input formats. */
export function isValidEgyptianManualPhone(input) {
  return typeof input === "string" && /^(?:0\d{10}|\+20 ?\d{10})$/.test(input.trim());
}
