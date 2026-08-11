import type { Metadata } from "next"
import { ManagerBookingsPage } from "@/components/dashboard/manager/manager-bookings-page"

export const metadata: Metadata = {
  title: "Manager Bookings | Mal3bk",
}

export default function ManagerBookings() {
  return <ManagerBookingsPage />
}
