import type { Metadata } from "next"
import { UsersManagement } from "@/components/dashboard/admin/users-management"

export const metadata: Metadata = {
  title: "Admin Users",
}

export default function UsersPage() {
  return <UsersManagement />
}
