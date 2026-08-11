import type { Metadata } from "next"
import { AdminRevenuePage } from "@/components/dashboard/admin/admin-revenue-page"

export const metadata: Metadata = {
  title: "Admin Revenue | Mal3bk",
}

export default function AdminRevenueRoute() {
  return <AdminRevenuePage />
}
