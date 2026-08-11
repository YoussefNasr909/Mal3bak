import type { Metadata } from "next"
import { AdminDashboard } from "@/components/dashboard/admin/admin-dashboard"

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Monitor courts, users, bookings, and platform activity from the Mal3bk admin dashboard.",
}

export default function AdminDashboardPage() {
  return <AdminDashboard />
}
