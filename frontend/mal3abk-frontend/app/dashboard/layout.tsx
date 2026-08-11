import type { Metadata } from "next"
import type React from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { NotificationProvider } from "@/components/providers/notification-provider"
import { BottomNav } from "@/components/ui/bottom-nav"
import { requireDashboardUser } from "@/lib/server-auth"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireDashboardUser()
  return (
    <NotificationProvider>
      <DashboardLayout>{children}</DashboardLayout>
      <BottomNav />
    </NotificationProvider>
  )
}
