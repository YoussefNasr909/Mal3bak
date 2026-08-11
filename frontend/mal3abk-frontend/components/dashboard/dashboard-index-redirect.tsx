"use client"

import { useEffect } from "react"

export function DashboardIndexRedirect({ target }: { target: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.location.pathname === target) return
    window.location.replace(target)
  }, [target])

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Redirecting to your dashboard…
    </div>
  )
}
