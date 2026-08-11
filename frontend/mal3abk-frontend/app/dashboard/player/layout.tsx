import type { Metadata } from "next"
import type React from "react"
import { requireRole } from "@/lib/server-auth"

export const metadata: Metadata = {
  title: {
    default: "Player | Mal3bk",
    template: "%s | Mal3bk",
  },
}

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("player")
  return <>{children}</>
}
