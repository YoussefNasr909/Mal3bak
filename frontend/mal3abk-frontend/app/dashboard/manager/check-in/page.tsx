import type { Metadata } from "next"
import { CheckInPage } from "@/components/dashboard/manager/check-in-page"

export const metadata: Metadata = {
  title: "Manager Check-in | Mal3bk",
}

export default function ManagerCheckIn() {
  return <CheckInPage />
}
