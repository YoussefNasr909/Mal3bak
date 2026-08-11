import type { Metadata } from "next"
import type React from "react"
import { requireRole } from "@/lib/server-auth"

export const metadata: Metadata = {
  title: "Manager | Mal3bk",
}

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("manager")
  return <>{children}</>
}
