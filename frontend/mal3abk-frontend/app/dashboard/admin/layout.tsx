import type { Metadata } from "next"
import type React from "react"
import { requireRole } from "@/lib/server-auth"

export const metadata: Metadata = {
  title: {
    default: "Admin | Mal3bk",
    template: "%s | Mal3bk",
  },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin")
  return <>{children}</>
}
