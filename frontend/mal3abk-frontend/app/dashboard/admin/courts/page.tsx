import type { Metadata } from "next"
import { AdminCourtsPage } from "@/components/dashboard/admin/admin-courts-page"

export const metadata: Metadata = {
  title: "Admin Courts",
}

export default function AdminCourts() {
  return <AdminCourtsPage />
}
