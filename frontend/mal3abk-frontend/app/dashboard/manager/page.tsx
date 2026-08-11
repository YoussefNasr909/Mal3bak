import type { Metadata } from "next"
import { ManagerDashboard } from "@/components/dashboard/manager/manager-dashboard"

export const metadata: Metadata = {
  title: "Manager Dashboard | Mal3bk",
}

export default function ManagerDashboardPage() {
  return <ManagerDashboard />
}
