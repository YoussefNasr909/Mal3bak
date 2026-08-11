import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PlayerBookingAccessPage } from "@/components/booking/player-booking-access-page"
import { getServerSessionUser } from "@/lib/server-auth"

type PageProps = {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: "Court Booking | Mal3bk",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function BookCourtEntryPage({ params }: PageProps) {
  const { id } = await params
  const user = await getServerSessionUser()

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/book/${id}`)}`)
  }

  if (user.role === "player") {
    redirect(`/dashboard/player/browse/${id}`)
  }

  return <PlayerBookingAccessPage mode="court" role={user.role} />
}
