export type BookingEntryRole = "admin" | "manager" | "player" | null | undefined

export function getBookingBrowseEntryHref() {
  return "/book"
}

export function getBookingCourtEntryHref(courtId: string) {
  return `/book/${courtId}`
}

export function getDashboardHomeHref(role: BookingEntryRole) {
  if (role === "admin") return "/dashboard/admin"
  if (role === "manager") return "/dashboard/manager"
  if (role === "player") return "/dashboard/player"
  return "/"
}
