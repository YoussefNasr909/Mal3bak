import type { Metadata } from "next"
import { ManagerCourtsPage } from "@/components/dashboard/manager/manager-courts-page"

export const metadata: Metadata = {
  title: "Manager Courts | Mal3bk",
}

export default function ManagerCourts() {
  return <ManagerCourtsPage />
}
