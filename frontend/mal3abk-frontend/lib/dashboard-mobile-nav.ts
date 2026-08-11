import type { LucideIcon } from "lucide-react"
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Compass,
  CreditCard,
  Home,
  LayoutDashboard,
  Trophy,
  User,
} from "lucide-react"

export type DashboardMobileNavRole = "player" | "manager" | "admin"

export type DashboardMobileNavItem = {
  href: string
  labelKey: string
  icon: LucideIcon
  isActive: (pathname: string) => boolean
}

/** Mobile bottom bar: max 5 items, ordered by daily-use priority (matches sidebar flow). */
export const dashboardMobileNavByRole: Record<DashboardMobileNavRole, DashboardMobileNavItem[]> = {
  player: [
    {
      href: "/dashboard/player",
      labelKey: "nav.home",
      icon: Home,
      isActive: (pathname) => pathname === "/" || pathname === "/dashboard/player",
    },
    {
      href: "/dashboard/player/browse",
      labelKey: "nav.discover",
      icon: Compass,
      isActive: (pathname) =>
        pathname.includes("/browse") || pathname.startsWith("/book"),
    },
    {
      href: "/dashboard/player/bookings",
      labelKey: "dashboard.myBookings",
      icon: CalendarCheck,
      isActive: (pathname) => pathname.includes("/player/bookings"),
    },
    {
      href: "/dashboard/player/tournaments",
      labelKey: "dashboard.tournaments",
      icon: Trophy,
      isActive: (pathname) => pathname.includes("/player/tournaments"),
    },
    {
      href: "/dashboard/profile",
      labelKey: "nav.profile",
      icon: User,
      isActive: (pathname) => pathname.includes("/profile"),
    },
  ],
  manager: [
    {
      href: "/dashboard/manager",
      labelKey: "nav.home",
      icon: LayoutDashboard,
      isActive: (pathname) => pathname === "/dashboard/manager",
    },
    {
      href: "/dashboard/manager/bookings",
      labelKey: "bookings.title",
      icon: CalendarDays,
      isActive: (pathname) => pathname.includes("/manager/bookings"),
    },
    {
      href: "/dashboard/manager/check-in",
      labelKey: "dashboard.checkIn",
      icon: CheckCircle2,
      isActive: (pathname) => pathname.includes("/manager/check-in"),
    },
    {
      href: "/dashboard/manager/revenue",
      labelKey: "dashboard.revenue",
      icon: CreditCard,
      isActive: (pathname) => pathname.includes("/manager/revenue"),
    },
    {
      href: "/dashboard/manager/courts",
      labelKey: "dashboard.myCourts",
      icon: Building2,
      isActive: (pathname) =>
        pathname.includes("/manager/courts") && !pathname.includes("/bookings"),
    },
  ],
  admin: [
    {
      href: "/dashboard/admin",
      labelKey: "nav.home",
      icon: LayoutDashboard,
      isActive: (pathname) => pathname === "/dashboard/admin",
    },
    {
      href: "/dashboard/admin/bookings",
      labelKey: "bookings.title",
      icon: CalendarDays,
      isActive: (pathname) => pathname.includes("/admin/bookings"),
    },
    {
      href: "/dashboard/admin/check-in",
      labelKey: "dashboard.checkIn",
      icon: CheckCircle2,
      isActive: (pathname) => pathname.includes("/admin/check-in"),
    },
    {
      href: "/dashboard/admin/courts",
      labelKey: "courts.title",
      icon: Building2,
      isActive: (pathname) => pathname.includes("/admin/courts"),
    },
    {
      href: "/dashboard/admin/revenue",
      labelKey: "dashboard.revenue",
      icon: CreditCard,
      isActive: (pathname) => pathname.includes("/admin/revenue"),
    },
  ],
}
