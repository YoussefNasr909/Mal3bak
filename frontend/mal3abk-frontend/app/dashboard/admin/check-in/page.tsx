import type { Metadata } from "next"
import { CheckInPage } from "@/components/dashboard/manager/check-in-page"

export const metadata: Metadata = {
  title: "Admin Check-in | Mal3bk",
}

export default function AdminCheckIn() {
  return <CheckInPage mode="admin" />
}
