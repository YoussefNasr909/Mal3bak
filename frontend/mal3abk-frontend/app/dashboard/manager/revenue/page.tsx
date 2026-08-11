import type { Metadata } from "next"
import { ManagerRevenuePage } from "@/components/dashboard/manager/manager-revenue-page"

export const metadata: Metadata = {
  title: "Manager Revenue | Mal3bk",
}

export default function ManagerRevenueRoute() {
  return <ManagerRevenuePage />
}
