export const BOOKING_NOTE_MAX_LENGTH = 200

const BOOKING_NOTE_METADATA_ONLY_PATTERNS = [
  /^\[archived by admin\]$/i,
]

const BOOKING_NOTE_METADATA_SUFFIX_PATTERNS = [
  /\s*\|\s*\[archived by admin\]\s*$/i,
]

const SYSTEM_BOOKING_NOTE_PATTERNS = [
  /^\s*walk-in:\s*.+\|\s*phone:\s*.+$/i,
  /^\s*registered customer:\s*.+\|\s*phone:\s*.+$/i,
  /^\s*(?:عميل مسجل|عميل زائر|زائر)\s*:\s*.+\|\s*(?:الهاتف|رقم الهاتف|هاتف)\s*:\s*.+$/i,
]

export function normalizeBookingNote(note?: string | null) {
  if (typeof note !== "string") return ""

  let normalized = note.trim()
  if (!normalized) return ""

  for (const suffixPattern of BOOKING_NOTE_METADATA_SUFFIX_PATTERNS) {
    normalized = normalized.replace(suffixPattern, "").trim()
  }

  if (!normalized) return ""
  if (BOOKING_NOTE_METADATA_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))) return ""
  if (SYSTEM_BOOKING_NOTE_PATTERNS.some((pattern) => pattern.test(normalized))) return ""

  return normalized
}

export function toBookingNotePayload(note?: string | null) {
  const normalized = normalizeBookingNote(note)
  return normalized || null
}

export function hasBookingNote(note?: string | null) {
  return normalizeBookingNote(note).length > 0
}
