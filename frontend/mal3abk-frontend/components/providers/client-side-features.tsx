"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"

const Toaster = dynamic(() => import("@/components/ui/sonner").then((mod) => mod.Toaster), { ssr: false })
const CommandPalette = dynamic(() => import("@/components/command-palette").then((mod) => mod.CommandPalette), {
  ssr: false,
})
const ScrollToTop = dynamic(() => import("@/components/ui/scroll-to-top").then((mod) => mod.ScrollToTop), { ssr: false })

export function ClientSideFeatures() {
  const pathname = usePathname()
  const [enableNonCriticalUi, setEnableNonCriticalUi] = useState(false)
  const isHome = pathname === "/"
  const isDashboard = pathname?.startsWith("/dashboard")

  useEffect(() => {
    if (enableNonCriticalUi || typeof window === "undefined") return

    let idleId: number | undefined
    let timeoutId: number | undefined

    const enable = () => setEnableNonCriticalUi(true)
    const requestIdle = window.requestIdleCallback?.bind(window)
    const cancelIdle = window.cancelIdleCallback?.bind(window)

    if (requestIdle && cancelIdle) {
      idleId = requestIdle(enable, { timeout: 1500 })
      return () => {
        if (idleId !== undefined) {
          cancelIdle(idleId)
        }
      }
    }

    timeoutId = window.setTimeout(enable, 1000)
    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [enableNonCriticalUi])

  return (
    <>
      {!isHome || enableNonCriticalUi ? <Toaster /> : null}
      {enableNonCriticalUi ? <ScrollToTop /> : null}
      {enableNonCriticalUi && isDashboard ? <CommandPalette /> : null}
    </>
  )
}
