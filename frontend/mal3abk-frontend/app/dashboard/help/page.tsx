import type { Metadata } from "next"
import { HelpPage } from "@/components/dashboard/help/help-page"

export const metadata: Metadata = {
  title: "Help Center | Mal3bk",
}

export default function DashboardHelpPage() {
  return <HelpPage />
}
