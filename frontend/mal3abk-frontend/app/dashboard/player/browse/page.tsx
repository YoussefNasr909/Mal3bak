import type { Metadata } from "next"
import { BrowseCourtsPage } from "@/components/dashboard/player/browse-courts-page"

export const metadata: Metadata = {
  title: "Browse Courts",
}

export default function BrowseCourts() {
  return <BrowseCourtsPage />
}
