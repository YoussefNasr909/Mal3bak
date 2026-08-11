import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PlayerBookingAccessPage } from "@/components/booking/player-booking-access-page"
import { getServerSessionUser } from "@/lib/server-auth"

export const metadata: Metadata = {
  title: "Court Booking | Mal3bk",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function BookEntryPage() {
  const user = await getServerSessionUser()

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent("/book")}`)
  }

  if (user.role === "player") {
    redirect("/dashboard/player/browse")
  }

  return <PlayerBookingAccessPage mode="browse" role={user.role} />
}
