"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import {
  dashboardMobileNavByRole,
  type DashboardMobileNavRole,
} from "@/lib/dashboard-mobile-nav"
import { cn } from "@/lib/utils"

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useLanguage()
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(true)
  const isVisibleRef = useRef(true)
  const lastScrollY = useRef(0)

  const isHiddenRoute = !pathname.startsWith("/dashboard")

  const setNavVisible = useCallback((nextVisible: boolean) => {
    if (isVisibleRef.current === nextVisible) return

    isVisibleRef.current = nextVisible
    setIsVisible(nextVisible)
  }, [])

  useEffect(() => {
    lastScrollY.current = typeof window === "undefined" ? 0 : window.scrollY
    setNavVisible(true)
  }, [pathname, setNavVisible])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isHiddenRoute || !window.matchMedia("(max-width: 767px)").matches) return

    let ticking = false
    lastScrollY.current = window.scrollY

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          const delta = currentScrollY - lastScrollY.current

          if (delta < -4 || currentScrollY < 50) {
            setNavVisible(true)
          } else if (delta > 4 && currentScrollY > 100) {
            setNavVisible(false)
          }

          lastScrollY.current = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [isHiddenRoute, setNavVisible])

  const navItems = useMemo(() => {
    const role = user?.role
    if (role !== "player" && role !== "manager" && role !== "admin") return []

    const items = dashboardMobileNavByRole[role as DashboardMobileNavRole]
    return items.map((item) => ({
      ...item,
      label: t(item.labelKey),
      isActive: item.isActive(pathname),
    }))
  }, [pathname, t, user?.role])

  useEffect(() => {
    if (typeof document === "undefined") return

    const root = document.documentElement
    const shouldReserveNavSpace = !isHiddenRoute && navItems.length > 0 && isVisible
    root.style.setProperty(
      "--mobile-bottom-nav-offset",
      shouldReserveNavSpace ? "calc(5.75rem + env(safe-area-inset-bottom))" : "0.75rem",
    )
    root.dataset.mobileBottomNav = shouldReserveNavSpace ? "visible" : "hidden"

    return () => {
      root.style.removeProperty("--mobile-bottom-nav-offset")
      delete root.dataset.mobileBottomNav
    }
  }, [isHiddenRoute, isVisible, navItems.length])

  if (isHiddenRoute || navItems.length === 0) return null

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 transform-gpu transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none md:hidden",
        isVisible ? "translate-y-0" : "translate-y-[120%]",
      )}
    >
      <div className="mx-3 mb-[calc(0.75rem+env(safe-area-inset-bottom))] rounded-2xl border border-border/50 bg-background/96 shadow-[0_8px_20px_rgba(15,23,42,0.12)] sm:bg-background/92 sm:backdrop-blur-sm sm:supports-[backdrop-filter]:bg-background/88 dark:border-white/10 dark:bg-slate-950/94 dark:shadow-[0_8px_22px_rgba(2,6,23,0.42)] sm:dark:bg-slate-950/88">
        <nav
          className="flex h-16 select-none items-center justify-around px-1"
          aria-label={t("nav.dashboard")}
        >
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.isActive ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  "flex h-full min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 px-0.5 transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 [-webkit-tap-highlight-color:transparent]",
                  item.isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-200",
                )}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.vibrate) {
                    navigator.vibrate([20])
                  }
                }}
              >
                <div
                  className={cn(
                    "relative flex transform-gpu items-center justify-center transition-transform duration-150",
                    item.isActive ? "scale-110" : "scale-100",
                  )}
                >
                  {item.isActive && (
                    <span className="absolute inset-0 scale-150 rounded-full bg-primary/10 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50" />
                  )}
                  <Icon
                    strokeWidth={item.isActive ? 2.5 : 2}
                    className={cn("h-5 w-5", item.isActive && "drop-shadow-sm")}
                  />
                </div>
                <span
                  className={cn(
                    "max-w-full truncate text-center text-[10px] font-medium leading-tight",
                    item.isActive && "font-semibold",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
