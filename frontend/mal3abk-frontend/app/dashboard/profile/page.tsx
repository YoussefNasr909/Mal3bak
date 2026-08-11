import type { Metadata } from "next"
import { ProfilePage } from "@/components/dashboard/profile/profile-page"

export const metadata: Metadata = {
  title: "Profile | Mal3bk",
}

export default function DashboardProfilePage() {
  return <ProfilePage />
}
