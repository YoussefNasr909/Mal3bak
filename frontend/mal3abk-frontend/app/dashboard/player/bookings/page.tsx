import type { Metadata } from "next"
import { PlayerBookingsPage } from "@/components/dashboard/player/player-bookings-page"

export const metadata: Metadata = {
  title: "My Bookings",
}

export default function PlayerBookings() {
  return <PlayerBookingsPage />
}
