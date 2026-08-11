import type { Metadata } from "next"
import { AdminBookingsPage } from "@/components/dashboard/admin/admin-bookings-page"

export const metadata: Metadata = {
  title: "Admin Bookings",
}

export default function AdminBookings() {
  return <AdminBookingsPage />
}
