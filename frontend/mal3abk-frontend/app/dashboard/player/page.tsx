import type { Metadata } from "next"
import { PlayerDashboard } from "@/components/dashboard/player/player-dashboard"

export const metadata: Metadata = {
  title: "Player Dashboard",
  description: "View upcoming bookings, favorites, and account activity from your Mal3bk player dashboard.",
}

export default function PlayerDashboardPage() {
  return <PlayerDashboard />
}
