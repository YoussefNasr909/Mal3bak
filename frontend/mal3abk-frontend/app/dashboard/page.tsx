import { DashboardIndexRedirect } from "@/components/dashboard/dashboard-index-redirect"
import { getDefaultDashboardPath } from "@/lib/auth-routing"
import { requireDashboardUser } from "@/lib/server-auth"

export default async function DashboardIndexPage() {
  const user = await requireDashboardUser()
  const target = getDefaultDashboardPath(user.role)
  return <DashboardIndexRedirect target={target} />
}
