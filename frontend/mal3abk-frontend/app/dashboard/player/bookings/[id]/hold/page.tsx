import type { Metadata } from "next"
import { ReservationHoldPage } from "@/components/dashboard/player/reservation-hold-page"

export const metadata: Metadata = {
  title: "Reservation Hold | Mal3abk",
}

interface HoldPageProps {
  params: Promise<{ id: string }>
}

export default async function HoldRoute({ params }: HoldPageProps) {
  const { id } = await params
  return <ReservationHoldPage bookingId={id} />
}
