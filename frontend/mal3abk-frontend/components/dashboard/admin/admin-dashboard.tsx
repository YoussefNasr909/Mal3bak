"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { ReactNode } from "react"
import {
  ArrowRight,
  ArrowUpDown,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  Gauge,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
  Tag,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { sportTypes } from "@/lib/constants"
import { normalizeBookingStatus } from "@/hooks/use-bookings-data"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import {
  adminListUsers,
  listBookings,
  listCourts,
  adminGetDashboardStats,
  type AdminUser,
} from "@/lib/api"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"

import { useIsMobile } from "@/components/ui/use-mobile"
import { DashboardStatCard, DashboardStatGrid } from "@/components/dashboard/shared/dashboard-stat-card"
import { DashboardWelcomeCard } from "@/components/dashboard/shared/dashboard-welcome-card"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { toast } from "sonner"
import type { Booking, Court } from "@/lib/types"

type Period = "today" | "7d" | "30d"
type ViewMode = "cards" | "table"
type BookingSort =
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc"
  | "status"
  | "court"
  | "player"

const asDay = (iso: string) => new Date(`${iso}T00:00:00`)

const toLocalISODate = () => {
  // ✅ FIX: Force Cairo time to prevent midnight/timezone shifting bugs in Admin Analytics
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

const csvEscape = (value: unknown) => {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatMoneyEGP(n: number, language: string) {
  const val = Number.isFinite(n) ? n : 0
  const formatted = Math.round(val).toLocaleString(language === "ar" ? "ar-EG" : "en-US")
  return language === "ar" ? `${formatted} جنيه` : `${formatted} EGP`
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

async function fetchAllPaginatedItems<T>(
  fetchPage: (page: number, limit: number) => Promise<{ items?: T[] }>,
  getPages: (result: { items?: T[] }) => number,
  limit: number,
) {
  const safeLimit = clamp(limit, 1, 200)
  const firstPage = await fetchPage(1, safeLimit)
  const allItems = [...(firstPage.items ?? [])]
  const totalPages = Math.max(1, Number(getPages(firstPage) || 1))

  if (totalPages === 1) {
    return allItems
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2, safeLimit)),
  )

  remainingPages.forEach((pageResult) => {
    allItems.push(...(pageResult.items ?? []))
  })

  return allItems
}

function statusTone(status: string) {
  const s = normalizeBookingStatus(status)
  if (s === "confirmed" || s === "completed") return "success"
  if (s === "cancelled" || s === "no_show") return "destructive"
  return "default"
}

function paymentTone(paymentStatus: string) {
  const s = String(paymentStatus || "pending").toLowerCase()
  if (s === "pending" || s === "pending_payment") return "warning"
  if (s === "paid" || s === "completed") return "success"
  if (s === "refunded") return "secondary"
  if (s === "failed") return "destructive"
  return "default"
}

function getStatusLabel(status: string, language: string) {
  const labels: Record<string, { ar: string; en: string }> = {
    confirmed: { ar: "مؤكد", en: "Confirmed" },
    cancelled: { ar: "ملغي", en: "Cancelled" },
    completed: { ar: "مكتمل", en: "Completed" },
    no_show: { ar: "لم يحضر", en: "Missed booking" },
  }
  const normalizedStatus = normalizeBookingStatus(status)
  return labels[normalizedStatus]?.[language as "ar" | "en"] || normalizedStatus
}

function getPaymentLabel(paymentStatus: string, language: string) {
  const s = String(paymentStatus || "pending").toLowerCase()
  if (s === "pending" || s === "pending_payment") return language === "ar" ? "غير مدفوع" : "Unpaid"
  if (s === "paid" || s === "completed") return language === "ar" ? "مدفوع" : "Paid"
  if (s === "refunded") return language === "ar" ? "مسترد" : "Refunded"
  if (s === "failed") return language === "ar" ? "فشل" : "Failed"
  return language === "ar" ? "غير معروف" : "Unknown"
}

function hasRevenueAttendanceRecord(booking: Partial<Booking> | Record<string, unknown>) {
  return Boolean(
    booking?.status === "completed" ||
      booking?.checkInVerified === true ||
      booking?.checkedIn === true ||
      booking?.checkedInAt,
  )
}

function formatDate(iso: string, language: string) {
  const d = asDay(iso)
  return d.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
  })
}

function formatTimeRange(startTime?: string, endTime?: string) {
  const s = startTime || "—"
  const e = endTime || "—"
  return `${s} - ${e}`
}

function ProgressRing({
  value,
  label,
  subLabel,
}: {
  value: number
  label: string
  subLabel?: string
}) {
  const v = clamp(value, 0, 100)
  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground sm:text-xs">{label}</p>
          <p className="mt-1 text-xl font-black tabular-nums">{Math.round(v)}%</p>
          {subLabel ? <p className="mt-1 text-xs text-muted-foreground sm:text-[11px]">{subLabel}</p> : null}
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-muted/20">
          <Gauge className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3">
        <Progress value={v} className="h-2 rounded-full" />
      </div>
    </div>
  )
}

const StatCard = DashboardStatCard

function SectionHeader({
  title,
  desc,
  right,
}: {
  title: string
  desc?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-base font-black tracking-tight">{title}</p>
        {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  )
}

function EmptyHint({
  icon,
  title,
  desc,
}: {
  icon: ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-background/50 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-muted/20">
        {icon}
      </div>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  )
}

export function AdminDashboard() {
  const { language } = useLanguage()
  const { user } = useAuth()
  const isMobile = useIsMobile()

  // -----------------------
  // Source data (REAL API)
  // -----------------------
  const [users, setUsers] = useState<AdminUser[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [statsData, setStatsData] = useState<any>(null)

  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [tab, setTab] = useState<"overview" | "bookings" | "users" | "courts" | "payments">("overview")
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [courtsLoaded, setCourtsLoaded] = useState(false)
  const [bookingsLoaded, setBookingsLoaded] = useState(false)

  const loadStats = useCallback(async () => {
    try {
      setDashboardLoading(true)
      setDashboardError(null)

      const statsRes = await adminGetDashboardStats()
      setStatsData(statsRes)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : language === "ar"
            ? "فشل تحميل بيانات لوحة الإدارة"
            : "Failed to load admin dashboard data"

      setDashboardError(message)
      toast.error(message)
    } finally {
      setDashboardLoading(false)
    }
  }, [language])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const loadUsers = useCallback(async () => {
    if (usersLoaded) return
    try {
      setDashboardLoading(true)
      const usersItems = await fetchAllPaginatedItems<AdminUser>(
        (page, limit) => adminListUsers({ page, limit }),
        (result: any) => result.pages,
        100,
      )
      setUsers(usersItems)
      setUsersLoaded(true)
    } finally {
      setDashboardLoading(false)
    }
  }, [usersLoaded])

  const loadCourts = useCallback(async () => {
    if (courtsLoaded) return
    try {
      setDashboardLoading(true)
      const courtsItems = await fetchAllPaginatedItems<Court>(
        (page, limit) => listCourts({ page, limit }),
        (result: any) => result.pagination?.pages,
        100,
      )
      setCourts(courtsItems)
      setCourtsLoaded(true)
    } finally {
      setDashboardLoading(false)
    }
  }, [courtsLoaded])

  const loadBookings = useCallback(async () => {
    if (bookingsLoaded) return
    try {
      setDashboardLoading(true)
      const bookingsItems = await fetchAllPaginatedItems<Booking>(
        (page, limit) => listBookings({ page, limit }),
        (result: any) => result.pages,
        500,
      )
      setBookings(bookingsItems)
      setBookingsLoaded(true)
    } finally {
      setDashboardLoading(false)
    }
  }, [bookingsLoaded])

  useEffect(() => {
    if (tab === "users") {
      loadUsers()
      return
    }

    if (tab === "courts") {
      loadCourts()
      return
    }

    if (tab === "bookings" || tab === "payments") {
      loadBookings()
    }
  }, [loadBookings, loadCourts, loadUsers, tab])

  const refreshDashboard = useCallback(async () => {
    await loadStats()

    if (usersLoaded || tab === "users" || tab === "bookings" || tab === "payments") {
      setUsersLoaded(false)
      setUsers([])
    }

    if (courtsLoaded || tab === "courts" || tab === "bookings" || tab === "payments") {
      setCourtsLoaded(false)
      setCourts([])
    }

    if (bookingsLoaded || tab === "bookings" || tab === "payments") {
      setBookingsLoaded(false)
      setBookings([])
    }
  }, [bookingsLoaded, courtsLoaded, loadStats, tab, usersLoaded])

  useAutoRefresh(refreshDashboard)

  // lookups
  const courtsById = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of courts) m.set(String(c.id), c)
    return m
  }, [courts])

  const usersById = useMemo(() => {
    const m = new Map<string, any>()
    for (const u of users) m.set(String(u.id), u)
    return m
  }, [users])

  // -----------------------
  // High-level KPIs
  // -----------------------
  const todayISO = useMemo(() => toLocalISODate(), [])

  const derived = useMemo(() => {
    if (!statsData) {
      return {
        grossRevenue: 0,
        netRevenue: 0,
        playedBookings: 0,
        bookingCounts: { confirmed: 0, pending: 0, completed: 0, cancelled: 0, no_show: 0, checked_in: 0 },
        totalBookings: 0,
        cancellationRate: 0,
        completionRate: 0,
        totalCourts: 0,
        totalUsers: 0,
        todayBookings: 0,
        usersBreakdown: { players: 0, managers: 0, admins: 0 },
      }
    }

    const {
      totalUsers,
      totalCourts,
      totalBookings,
      grossRevenue,
      bookingCounts,
      usersBreakdown,
      todayBookings,
    } = statsData

    const playedBookings = Number(bookingCounts.checked_in || 0)
    const cancellationRate =
      totalBookings > 0 ? Math.round((bookingCounts.cancelled / totalBookings) * 100) : 0
    const completionRate =
      totalBookings > 0 ? Math.round((playedBookings / totalBookings) * 100) : 0

    return {
      grossRevenue,
      netRevenue: grossRevenue,
      playedBookings,
      bookingCounts,
      totalBookings,
      cancellationRate,
      completionRate,
      totalCourts,
      totalUsers,
      todayBookings,
      usersBreakdown,
    }
  }, [statsData])

  // -----------------------
  // Tabs
  // -----------------------
  // -----------------------
  // BOOKING CENTER
  // -----------------------
  const [bkSearch, setBkSearch] = useState("")
  const [bkStatus, setBkStatus] = useState("all")
  const [bkCourt, setBkCourt] = useState("all")
  const [bkPeriod, setBkPeriod] = useState<Period>("7d")
  const [bkSort, setBkSort] = useState<BookingSort>("date_desc")
  const [bkView, setBkView] = useState<ViewMode>("table")
  const [bkPage, setBkPage] = useState(1)

  useEffect(() => {
    if (isMobile) setBkView("cards")
  }, [isMobile])

  const range = useMemo(() => {
    const today = asDay(todayISO)
    if (bkPeriod === "today") return { from: today, to: today }
    if (bkPeriod === "7d") {
      const from = new Date(today)
      from.setDate(from.getDate() - 6)
      return { from, to: today }
    }
    const from = new Date(today)
    from.setDate(from.getDate() - 29)
    return { from, to: today }
  }, [bkPeriod, todayISO])

  const getBookingAmount = useCallback((b: any) => Number(b.totalPrice || b.amount || 0), [])

  const getPlayerInfo = useCallback(
    (b: any) => {
      const playerId = b.playerId || b.userId
      const u = playerId ? usersById.get(String(playerId)) : undefined

      const name =
        language === "ar"
          ? b.playerName || b.userName || u?.fullNameAr || u?.fullName || u?.name || "—"
          : b.playerNameEn || b.userName || u?.fullNameEn || u?.fullName || u?.name || "—"

      return {
        id: playerId ? String(playerId) : "",
        name,
        phone: b.userPhone || u?.phone || "N/A",
        email: b.userEmail || u?.email || "N/A",
        avatar: b.userAvatar || u?.avatar || "/placeholder-user.jpg", // <--- ADDED b.userAvatar
      }
    },
    [language, usersById]
  )

  const getCourtInfo = useCallback(
    (b: any) => {
      const c = courtsById.get(String(b.courtId))
      const name =
        language === "ar"
          ? b.courtName || c?.name || "—"
          : b.courtNameEn || c?.nameEn || c?.name || "—"
      const sport = c?.sportType || b.sportType || ""
      const sportLabel = sport
        ? ((sportTypes as any)[sport]?.[language] || (sportTypes as any)[sport]?.en || sport)
        : "—"

      return {
        id: String(b.courtId || ""),
        name,
        address:
          language === "ar"
            ? b.courtAddress || c?.address || "—"
            : b.courtAddressEn || b.courtAddress || c?.addressEn || c?.address || "—",
        city:
          language === "ar"
            ? b.courtCity || c?.city || "—"
            : b.courtCityEn || b.courtCity || c?.cityEn || c?.city || "—",
        sportType: sport,
        sportLabel,
        managerId: c?.managerId ? String(c.managerId) : "",
        managerName:
          language === "ar"
            ? c?.managerNameAr || c?.managerName || "—"
            : c?.managerNameEn || c?.managerName || "—",
      }
    },
    [language, courtsById]
  )

  const bookingInRange = useCallback(
    (b: any) => {
      const iso = String(b.date || b.bookingDate || "")
      if (!iso) return true
      const d = asDay(iso)
      return d >= range.from && d <= range.to
    },
    [range]
  )

  const filteredBookings = useMemo(() => {
    const q = bkSearch.trim().toLowerCase()

    const list = (bookings || []).filter((b: any) => {
      if (bkStatus !== "all") {
        if (String(b.status || "").toLowerCase() !== bkStatus.toLowerCase()) return false
      }
      if (bkCourt !== "all") {
        if (String(b.courtId || "") !== bkCourt) return false
      }
      if (!bookingInRange(b)) return false

      if (!q) return true

      const player = getPlayerInfo(b).name.toLowerCase()
      const court = getCourtInfo(b).name.toLowerCase()
      const id = String(b.id || "").toLowerCase()
      const phone = String(b.userPhone || "").toLowerCase()
      const email = String(b.userEmail || usersById.get(String(b.playerId || b.userId))?.email || "").toLowerCase()

      return [player, court, id, phone, email].some((x) => x.includes(q))
    })

    const collator = new Intl.Collator(language === "ar" ? "ar-EG" : "en-US", { sensitivity: "base" })

    const sorted = [...list].sort((a: any, b: any) => {
      const da = asDay(String(a.date || todayISO)).getTime()
      const db = asDay(String(b.date || todayISO)).getTime()
      const amountA = getBookingAmount(a)
      const amountB = getBookingAmount(b)

      if (bkSort === "date_desc") return db - da
      if (bkSort === "date_asc") return da - db
      if (bkSort === "amount_desc") return amountB - amountA
      if (bkSort === "amount_asc") return amountA - amountB
      if (bkSort === "status") return collator.compare(String(a.status || ""), String(b.status || ""))
      if (bkSort === "court") return collator.compare(getCourtInfo(a).name, getCourtInfo(b).name)
      if (bkSort === "player") return collator.compare(getPlayerInfo(a).name, getPlayerInfo(b).name)
      return 0
    })

    return sorted
  }, [
    bookings,
    bkSearch,
    bkStatus,
    bkCourt,
    bkSort,
    bookingInRange,
    language,
    todayISO,
    getBookingAmount,
    getPlayerInfo,
    getCourtInfo,
    usersById,
  ])

  const bookingCourtOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const booking of bookings as any[]) {
      const id = String(booking?.courtId || "")
      if (!id || seen.has(id)) continue
      const label = language === "ar"
        ? booking?.courtName || "—"
        : booking?.courtNameEn || booking?.courtName || "—"
      seen.set(id, label)
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }))
  }, [bookings, language])

  const bkPageSize = 8
  const bkTotalPages = Math.max(1, Math.ceil(filteredBookings.length / bkPageSize))
  const pagedBookings = useMemo(() => {
    const p = clamp(bkPage, 1, bkTotalPages)
    const start = (p - 1) * bkPageSize
    return filteredBookings.slice(start, start + bkPageSize)
  }, [filteredBookings, bkPage, bkTotalPages])

  useEffect(() => setBkPage(1), [bkSearch, bkStatus, bkCourt, bkPeriod, bkSort])

  // Booking details dialog
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)

  const openBooking = useCallback((b: Booking) => {
    setSelectedBooking(b)
    setDetailsOpen(true)
  }, [])

  const selectedPlayer = useMemo(
    () => (selectedBooking ? getPlayerInfo(selectedBooking as any) : null),
    [selectedBooking, getPlayerInfo]
  )

  const selectedCourt = useMemo(
    () => (selectedBooking ? getCourtInfo(selectedBooking as any) : null),
    [selectedBooking, getCourtInfo]
  )


  const bookingsSummary = useMemo(() => {
    if (!statsData) return { todayCount: 0, confirmed: 0, cancelled: 0, revenue: 0 }
    return {
      todayCount: statsData.todayBookings,
      confirmed: statsData.bookingCounts.confirmed,
      cancelled: statsData.bookingCounts.cancelled,
      revenue: statsData.grossRevenue,
    }
  }, [statsData])

  // -----------------------
  // USER MANAGEMENT
  // -----------------------
  const [userSearch, setUserSearch] = useState("")
  const [userRole, setUserRole] = useState("all")

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    return users.filter((u: any) => {
      if (userRole !== "all") {
        const role = String(u.role || u.type || "").toLowerCase()
        if (!role.includes(userRole)) return false
      }
      if (!q) return true
      const name = String(u.fullName || u.name || u.username || "").toLowerCase()
      const email = String(u.email || "").toLowerCase()
      const phone = String(u.phone || "").toLowerCase()
      return [name, email, phone].some((x) => x.includes(q))
    })
  }, [users, userSearch, userRole])

  // -----------------------
  // COURTS MANAGEMENT
  // -----------------------
  const [courtSearch, setCourtSearch] = useState("")
  const [courtStatus, setCourtStatus] = useState("all")

  const filteredCourts = useMemo(() => {
    const q = courtSearch.trim().toLowerCase()
    return courts.filter((c: any) => {
      if (courtStatus !== "all") {
        if (String(c.status || "").toLowerCase() !== courtStatus.toLowerCase()) return false
      }
      if (!q) return true
      const name = String(c.name || "").toLowerCase()
      const nameEn = String(c.nameEn || "").toLowerCase()
      const city = String(c.city || "").toLowerCase()
      const cityEn = String(c.cityEn || "").toLowerCase()
      return [name, nameEn, city, cityEn].some((x) => x.includes(q))
    })
  }, [courts, courtSearch, courtStatus])

  // -----------------------
  // REVENUE / FINANCIAL SUMMARY
  // -----------------------
  const [paySearch, setPaySearch] = useState("")
  const [payStatus, setPayStatus] = useState("all")

  const filteredRevenueRows = useMemo(() => {
    const q = paySearch.trim().toLowerCase()

    return bookings.filter((b: any) => {
      if (!hasRevenueAttendanceRecord(b)) {
        return false
      }

      const pStatus = String(b.paymentStatus || "pending").toLowerCase()

      if (payStatus !== "all" && pStatus !== payStatus.toLowerCase()) {
        return false
      }

      if (!q) return true

      const player = getPlayerInfo(b).name.toLowerCase()
      const court = getCourtInfo(b).name.toLowerCase()
      const id = String(b.id || "").toLowerCase()
      const method = String(b.paymentMethod || "cash").toLowerCase()

      return [player, court, id, method].some((x) => x.includes(q))
    })
  }, [bookings, paySearch, payStatus, getPlayerInfo, getCourtInfo])

  const revenueKpis = useMemo(() => {
    if (!statsData) return {
      checkedInBookings: [],
      completedBookings: [],
      checkedInAmount: 0,
      completedAmount: 0,
      estimatedRevenue: 0,
      averageBooking: 0,
    }

    const { bookingCounts, grossRevenue, confirmedAmount, checkedInAmount, completedAmount } = statsData
    const checkedInBookingCount = Number(bookingCounts.checked_in || 0)
    const completedBookingCount = Number(bookingCounts.completed || 0)
    const playedBookingCount = checkedInBookingCount
    const actualCheckedInAmount = Number(checkedInAmount ?? grossRevenue ?? confirmedAmount ?? 0)
    const averageBooking = playedBookingCount > 0 ? Math.round(grossRevenue / playedBookingCount) : 0

    return {
      checkedInBookings: new Array(checkedInBookingCount),
      completedBookings: new Array(completedBookingCount),
      checkedInAmount: actualCheckedInAmount,
      completedAmount: Number(completedAmount || 0),
      estimatedRevenue: Number(grossRevenue || 0),
      averageBooking,
    }
  }, [statsData])

  // -----------------------
  // UI building blocks
  // -----------------------
  const renderHero = () => {
    const isAr = language === "ar"
    const displayName = user?.name || (isAr ? "مسؤول" : "Admin")

    return (
      <DashboardWelcomeCard
        title={isAr ? `مرحباً، ${displayName}` : `Welcome, ${displayName}`}
        description={
          isAr
            ? "لمحة سريعة عن المستخدمين، الملاعب، الحجوزات، والإيراد."
            : "Users, courts, bookings, and revenue at a glance."
        }
      />
    )
  }

  const renderTopTabs = () => (
    <Tabs dir={language === "ar" ? "rtl" : "ltr"} value={tab} onValueChange={(v) => setTab(v as any)} className="w-full space-y-4">
      <div className="flex w-full overflow-x-auto scrollbar-hide">
        <TabsList className="flex h-10 min-w-max items-center justify-start rounded-xl bg-muted/50 p-1 sm:w-full sm:justify-center">
          <TabsTrigger
            value="overview"
            className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
          >
            {language === "ar" ? "نظرة عامة" : "Overview"}
          </TabsTrigger>
          <TabsTrigger
            value="bookings"
            className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
          >
            {language === "ar" ? "الحجوزات" : "Bookings"}
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
          >
            {language === "ar" ? "المستخدمون" : "Users"}
          </TabsTrigger>
          <TabsTrigger
            value="courts"
            className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
          >
            {language === "ar" ? "الملاعب" : "Courts"}
          </TabsTrigger>
          <TabsTrigger
            value="payments"
            className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
          >
            {language === "ar" ? "الإيراد" : "Revenue"}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="space-y-5 outline-none">
        {renderOverviewTab()}
      </TabsContent>
      <TabsContent value="bookings" className="space-y-5 outline-none">
        {renderBookingsTab()}
      </TabsContent>
      <TabsContent value="users" className="space-y-5 outline-none">
        {renderUsersTab()}
      </TabsContent>
      <TabsContent value="courts" className="space-y-5 outline-none">
        {renderCourtsTab()}
      </TabsContent>
      <TabsContent value="payments" className="space-y-5 outline-none">
        {renderRevenueTab()}
      </TabsContent>
    </Tabs>
  )

  const renderOverviewTab = () => {
    const isAr = language === "ar"

    return (
      <div className="space-y-5">
        <DashboardStatGrid>
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label={isAr ? "المستخدمون" : "Users"}
            value={derived.totalUsers}
            subLabel={
              isAr
                ? `${derived.usersBreakdown.players} لاعب · ${derived.usersBreakdown.managers} مدير`
                : `${derived.usersBreakdown.players} players · ${derived.usersBreakdown.managers} managers`
            }
            tone="info"
            href="/dashboard/admin/users"
          />
          <StatCard
            icon={<Building2 className="h-4 w-4" />}
            label={isAr ? "الملاعب" : "Courts"}
            value={derived.totalCourts}
            tone="primary"
            href="/dashboard/admin/courts"
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label={isAr ? "الحجوزات" : "Bookings"}
            value={derived.totalBookings}
            subLabel={isAr ? `إلغاء ${derived.cancellationRate}%` : `${derived.cancellationRate}% cancelled`}
            tone="warning"
            href="/dashboard/admin/bookings"
          />
          <StatCard
            icon={<Banknote className="h-4 w-4" />}
            label={isAr ? "إيراد اللعب" : "Played revenue"}
            value={formatMoneyEGP(derived.grossRevenue, language)}
            tone="success"
            href="/dashboard/admin/revenue"
          />
        </DashboardStatGrid>

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{isAr ? "ملخص التشغيل اليومي" : "Daily operations summary"}</CardTitle>
              <CardDescription className="text-sm">
                {isAr ? "نظرة سريعة على نشاط الحجوزات" : "Quick look at booking activity"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{isAr ? "حجوزات اليوم" : "Today bookings"}</p>
                  <p className="font-semibold tabular-nums">{derived.todayBookings}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{isAr ? "حجوزات مؤكدة" : "Confirmed"}</p>
                  <p className="font-semibold tabular-nums">{derived.bookingCounts.confirmed}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{isAr ? "لاعبون تم تسجيل حضورهم" : "Checked-in players"}</p>
                  <p className="font-semibold tabular-nums">{derived.playedBookings}</p>
                </div>
              </div>
              <Button className="w-full rounded-2xl" onClick={() => setTab("bookings")}>
                <ArrowRight className="me-2 h-4 w-4" />
                {isAr ? "عرض الحجوزات" : "View bookings"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/60 bg-background/60 backdrop-blur lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{isAr ? "إجراءات سريعة" : "Quick actions"}</CardTitle>
              <CardDescription className="text-sm">
                {isAr ? "انتقل مباشرة إلى أقسام الإدارة الرئيسية" : "Jump to main admin sections"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Link href="/dashboard/admin/users" className="group rounded-2xl border border-border/60 bg-muted/10 p-4 hover:bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{isAr ? "إدارة المستخدمين" : "User management"}</p>
                    <p className="text-sm text-muted-foreground">{isAr ? "أدوار، تعطيل، مراجعة" : "Roles, status, review"}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-background/50">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/admin/courts" className="group rounded-2xl border border-border/60 bg-muted/10 p-4 hover:bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{isAr ? "إدارة الملاعب" : "Courts management"}</p>
                    <p className="text-sm text-muted-foreground">{isAr ? "مراجعة وتحديث الحالة" : "Review and update status"}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-background/50">
                    <Building2 className="h-5 w-5" />
                  </div>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setTab("bookings")}
                className="group rounded-2xl border border-border/60 bg-muted/10 p-4 text-left hover:bg-muted/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{isAr ? "الحجوزات" : "Bookings"}</p>
                    <p className="text-sm text-muted-foreground">{isAr ? "بحث، فلترة، وعرض التفاصيل" : "Search, filter, and view details"}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-background/50">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTab("payments")}
                className="group rounded-2xl border border-border/60 bg-muted/10 p-4 text-left hover:bg-muted/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{isAr ? "الإيراد التقديري" : "Estimated revenue"}</p>
                    <p className="text-sm text-muted-foreground">{isAr ? "ملخص مبالغ الحجوزات" : "Booking amounts summary"}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-background/50">
                    <Banknote className="h-5 w-5" />
                  </div>
                </div>
              </button>

              <Link
                href="/dashboard/admin/coupons"
                className="group rounded-2xl border border-border/60 bg-muted/10 p-4 hover:bg-muted/20 sm:col-span-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{isAr ? "الكوبونات وأكواد الخصم" : "Coupons & Promo Codes"}</p>
                    <p className="text-sm text-muted-foreground">
                      {isAr ? "إنشاء وإدارة حملات الخصم العامة والخاصة" : "Create and manage platform & venue promo campaigns"}
                    </p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border/60 bg-primary/10 text-primary">
                    <Tag className="h-5 w-5" />
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <ProgressRing
            value={derived.completionRate}
            label={isAr ? "نسبة الإكمال" : "Completion rate"}
            subLabel={isAr ? "من إجمالي الحجوزات" : "Of total bookings"}
          />
          <ProgressRing
            value={100 - derived.cancellationRate}
            label={isAr ? "ثبات الحجوزات" : "Booking stability"}
            subLabel={isAr ? "كلما زادت كان أفضل" : "Higher is better"}
          />
          <ProgressRing
            value={derived.totalBookings > 0 ? Math.round((derived.bookingCounts.confirmed / derived.totalBookings) * 100) : 0}
            label={isAr ? "الحجوزات المؤكدة" : "Confirmed bookings"}
            subLabel={isAr ? "من إجمالي الحجوزات" : "Of total bookings"}
          />
        </div>
      </div>
    )
  }

  const renderBookingsTab = () => {
    const isAr = language === "ar"

    return (
      <div className="space-y-5">
        <SectionHeader
          title={isAr ? "الحجوزات" : "Bookings"}
          desc={isAr ? "بحث وفلترة ومراجعة كل حجوزات المنصة" : "Search, filter, and review all platform bookings"}
          right={
            <>

              {!isMobile ? (
                <Button
                  variant="outline"
                  className="rounded-2xl bg-transparent"
                  onClick={() => setBkView(bkView === "table" ? "cards" : "table")}
                >
                  {bkView === "table" ? <BarChart3 className="me-2 h-4 w-4" /> : <Calendar className="me-2 h-4 w-4" />}
                  {bkView === "table" ? (isAr ? "عرض بطاقات" : "Cards") : (isAr ? "عرض جدول" : "Table")}
                </Button>
              ) : null}
            </>
          }
        />

        <DashboardStatGrid>
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label={isAr ? "اليوم" : "Today"}
            value={bookingsSummary.todayCount}
            tone="primary"
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label={isAr ? "مؤكد" : "Confirmed"}
            value={bookingsSummary.confirmed}
            tone="warning"
          />
          <StatCard
            icon={<XCircle className="h-4 w-4" />}
            label={isAr ? "ملغي" : "Cancelled"}
            value={bookingsSummary.cancelled}
            tone="destructive"
          />
          <StatCard
            icon={<Banknote className="h-4 w-4" />}
            label={isAr ? "إيراد" : "Revenue"}
            value={formatMoneyEGP(bookingsSummary.revenue, language)}
            tone="success"
          />
        </DashboardStatGrid>

        <Card className="rounded-3xl border-border/60 bg-background/60 backdrop-blur">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={bkSearch}
                    onChange={(e) => setBkSearch(e.target.value)}
                    placeholder={isAr ? "ابحث باللاعب / الملعب / رقم الحجز / الهاتف" : "Search player / court / booking id / phone"}
                    className="rounded-2xl ps-9"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={bkStatus} onValueChange={setBkStatus}>
                  <SelectTrigger className="w-[180px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "الحالة" : "Status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="confirmed">{isAr ? "مؤكد" : "Confirmed"}</SelectItem>
                    <SelectItem value="completed">{isAr ? "مكتمل" : "Completed"}</SelectItem>
                    <SelectItem value="cancelled">{isAr ? "ملغي" : "Cancelled"}</SelectItem>
                    <SelectItem value="no_show">{isAr ? "لم يحضر" : "Missed booking"}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={bkCourt} onValueChange={setBkCourt}>
                  <SelectTrigger className="w-[200px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "الملعب" : "Court"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "كل الملاعب" : "All courts"}</SelectItem>
                    {(courts.length > 0
                      ? courts.map((c: any) => ({ id: String(c.id), label: language === "ar" ? c.name : c.nameEn || c.name }))
                      : bookingCourtOptions
                    ).map((courtOption: any) => (
                      <SelectItem key={courtOption.id} value={courtOption.id}>
                        {courtOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={bkPeriod} onValueChange={(v) => setBkPeriod(v as Period)}>
                  <SelectTrigger className="w-[160px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "الفترة" : "Period"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">{isAr ? "اليوم" : "Today"}</SelectItem>
                    <SelectItem value="7d">{isAr ? "آخر 7 أيام" : "Last 7 days"}</SelectItem>
                    <SelectItem value="30d">{isAr ? "آخر 30 يوم" : "Last 30 days"}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={bkSort} onValueChange={(v) => setBkSort(v as BookingSort)}>
                  <SelectTrigger className="w-[190px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "ترتيب" : "Sort"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date_desc">{isAr ? "الأحدث" : "Newest"}</SelectItem>
                    <SelectItem value="date_asc">{isAr ? "الأقدم" : "Oldest"}</SelectItem>
                    <SelectItem value="amount_desc">{isAr ? "الأعلى مبلغًا" : "Amount (desc)"}</SelectItem>
                    <SelectItem value="amount_asc">{isAr ? "الأقل مبلغًا" : "Amount (asc)"}</SelectItem>
                    <SelectItem value="status">{isAr ? "حسب الحالة" : "By status"}</SelectItem>
                    <SelectItem value="court">{isAr ? "حسب الملعب" : "By court"}</SelectItem>
                    <SelectItem value="player">{isAr ? "حسب اللاعب" : "By player"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {isAr ? "عدد النتائج:" : "Results:"}{" "}
                <span className="font-semibold text-foreground">{filteredBookings.length}</span>
              </p>

              {!isMobile ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-2xl">
                    {isAr ? "عرض:" : "View:"} {bkView === "table" ? (isAr ? "جدول" : "Table") : (isAr ? "بطاقات" : "Cards")}
                  </Badge>
                  <Button
                    variant="outline"
                    className="rounded-2xl bg-transparent"
                    onClick={() => setBkView(bkView === "table" ? "cards" : "table")}
                  >
                    {bkView === "table" ? <BarChart3 className="me-2 h-4 w-4" /> : <CalendarDays className="me-2 h-4 w-4" />}
                    {bkView === "table" ? (isAr ? "بطاقات" : "Cards") : (isAr ? "جدول" : "Table")}
                  </Button>
                </div>
              ) : null}
            </div>

            {filteredBookings.length === 0 ? (
              <EmptyHint
                icon={<CalendarDays className="h-5 w-5" />}
                title={isAr ? "لا توجد حجوزات مطابقة" : "No matching bookings"}
                desc={isAr ? "جرّب تغيير الفلاتر أو البحث." : "Try changing filters or search."}
              />
            ) : bkView === "table" ? (
              renderBookingsTable()
            ) : (
              renderBookingsCards()
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-2xl bg-transparent"
                onClick={() => setBkPage((p) => Math.max(1, p - 1))}
                disabled={bkPage <= 1}
              >
                {isAr ? <ChevronRight className="me-2 h-4 w-4" /> : <ChevronLeft className="me-2 h-4 w-4" />}
                {isAr ? "السابق" : "Prev"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {bkPage} / {bkTotalPages}
              </span>
              <Button
                variant="outline"
                className="rounded-2xl bg-transparent"
                onClick={() => setBkPage((p) => Math.min(bkTotalPages, p + 1))}
                disabled={bkPage >= bkTotalPages}
              >
                {isAr ? "التالي" : "Next"}
                {isAr ? <ChevronLeft className="ms-2 h-4 w-4" /> : <ChevronRight className="ms-2 h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {renderBookingDetailsDialog()}
      </div>
    )
  }

  const renderBookingsTable = () => {
    const isAr = language === "ar"

    return (
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="whitespace-nowrap">{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead className="whitespace-nowrap">{isAr ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="whitespace-nowrap">{isAr ? "الوقت" : "Time"}</TableHead>
                <TableHead className="whitespace-nowrap">{isAr ? "اللاعب" : "Player"}</TableHead>
                <TableHead className="whitespace-nowrap">{isAr ? "الملعب" : "Court"}</TableHead>
                <TableHead className="whitespace-nowrap text-end">{isAr ? "المبلغ" : "Amount"}</TableHead>
                <TableHead className="whitespace-nowrap text-end">{isAr ? "إجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {pagedBookings.map((b: any) => {
                const player = getPlayerInfo(b)
                const court = getCourtInfo(b)
                const amount = getBookingAmount(b)
                const status = String(b.status || "pending")

                return (
                  <TableRow
                    key={String(b.id)}
                    className="cursor-pointer hover:bg-muted/20"
                    onClick={() => openBooking(b)}
                  >
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge variant={statusTone(status) as any} dot>
                        {getStatusLabel(status, language)}
                      </StatusBadge>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{formatDate(String(b.date || todayISO), language)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        #{String(b.id).slice(0, 8)}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{formatTimeRange(b.startTime, b.endTime)}</span>
                      </div>
                    </TableCell>

                    <TableCell className="min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 ring-1 ring-border/60">
                          <AvatarImage src={player.avatar} />
                          <AvatarFallback>{player.name?.charAt(0) || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{player.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{player.phone}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="min-w-[220px]">
                      <p className="truncate font-semibold">{court.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <MapPin className="me-1 inline h-3.5 w-3.5" />
                        {court.city}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-end font-semibold">
                      {formatMoneyEGP(amount, language)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="rounded-2xl bg-transparent" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isAr ? "start" : "end"} className="rounded-2xl">
                          <DropdownMenuItem onClick={() => openBooking(b)}>
                            <Eye className="me-2 h-4 w-4" />
                            {isAr ? "عرض" : "View"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              toast.success(isAr ? "تم نسخ رقم الحجز" : "Booking id copied")
                              navigator.clipboard?.writeText(String(b.id))
                            }}
                          >
                            <Copy className="me-2 h-4 w-4" />
                            {isAr ? "نسخ ID" : "Copy ID"}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard/admin/bookings">
                              <CalendarDays className="me-2 h-4 w-4" />
                              {isAr ? "إدارة الحجوزات" : "Manage bookings"}
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  const renderBookingsCards = () => {
    const isAr = language === "ar"

    return (
      <div className="grid gap-2.5 md:grid-cols-2">
          {pagedBookings.map((b: any) => {
            const player = getPlayerInfo(b)
            const court = getCourtInfo(b)
            const amount = getBookingAmount(b)
            const status = String(b.status || "pending")

            return (
                <div
                  key={String(b.id)}
                  role="button"
                  tabIndex={0}
                  className="w-full rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-muted/30"
                  onClick={() => openBooking(b)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openBooking(b)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <StatusBadge variant={statusTone(status) as any} dot>
                      {getStatusLabel(status, language)}
                    </StatusBadge>
                    <Badge variant="outline" className="rounded-2xl text-[11px]">
                      #{String(b.id).slice(0, 8)}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10 ring-1 ring-border/60">
                      <AvatarImage src={player.avatar} />
                      <AvatarFallback>{player.name?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{player.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{player.phone}</p>
                    </div>
                    <div className="ms-auto text-end">
                      <p className="text-xs text-muted-foreground">{isAr ? "المبلغ" : "Amount"}</p>
                      <p className="font-black">{formatMoneyEGP(amount, language)}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">{isAr ? "التاريخ" : "Date"}</p>
                      <p className="text-sm font-semibold">{formatDate(String(b.date || todayISO), language)}</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">{isAr ? "الوقت" : "Time"}</p>
                      <p className="text-sm font-semibold">{formatTimeRange(b.startTime, b.endTime)}</p>
                    </div>
                    <div className="col-span-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] text-muted-foreground">{isAr ? "الملعب" : "Court"}</p>
                      <p className="truncate text-sm font-semibold">{court.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <MapPin className="me-1 inline h-3.5 w-3.5" /> {court.city}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      className="rounded-2xl bg-transparent"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openBooking(b)
                      }}
                    >
                      <Eye className="me-2 h-4 w-4" />
                      {isAr ? "عرض" : "View"}
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-2xl bg-transparent"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        navigator.clipboard?.writeText(String(b.id))
                        toast.success(isAr ? "تم نسخ رقم الحجز" : "Copied booking id")
                      }}
                    >
                      <Copy className="me-2 h-4 w-4" />
                      {isAr ? "نسخ" : "Copy"}
                    </Button>
                  </div>
                </div>
            )
          })}
      </div>
    )
  }

  const renderBookingDetailsDialog = () => {
    const isAr = language === "ar"
    const b: any = selectedBooking
    if (!b) return null

    const player = selectedPlayer
    const court = selectedCourt
    const amount = getBookingAmount(b)
    const status = String(b.status || "pending")
    const checkInCode = b.checkInCode || b.code || ""
    const settlementMethod = String(b.paymentMethod || (isAr ? "في الملعب" : "On-site"))
    const checkedInLabel =
      b.checkInVerified || b.checkedIn || b.status === "completed" || Boolean(b.checkedInAt)
        ? (isAr ? "تم" : "Yes")
        : (isAr ? "لا" : "No")

    const infoRow = ({
      icon,
      label,
      value,
      secondary,
      action,
    }: {
      icon: ReactNode
      label: string
      value: ReactNode
      secondary?: ReactNode
      action?: ReactNode
    }) => (
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/50 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-border/60 bg-muted/20">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="break-words font-semibold">{value}</p>
            {secondary ? <p className="mt-1 break-words text-xs text-muted-foreground">{secondary}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    )

    return (
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-3xl sm:w-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-black tracking-tight">
                  {isAr ? "تفاصيل الحجز" : "Booking Details"}{" "}
                  <span className="text-muted-foreground">#{String(b.id).slice(0, 10)}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(String(b.date || todayISO), language)} • {formatTimeRange(b.startTime, b.endTime)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge variant={statusTone(status) as any} dot>
                  {getStatusLabel(status, language)}
                </StatusBadge>
                <Badge variant="outline" className="rounded-2xl">
                  {formatMoneyEGP(amount, language)}
                </Badge>
              </div>
            </DialogTitle>
            <DialogDescription>
              {isAr ? "عرض كامل: اللاعب، الملعب، الحضور، والمبلغ." : "Full view: player, court, check-in, and amount."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="rounded-3xl border-border/60 bg-background/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{isAr ? "اللاعب" : "Player"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-1 ring-border/60">
                      <AvatarImage src={player?.avatar || "/placeholder-user.jpg"} />
                      <AvatarFallback>{player?.name?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{player?.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{player?.phone}</p>
                    </div>
                    <Button
                      variant="outline"
                      className="ms-auto rounded-2xl bg-transparent"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(String(player?.phone || ""))
                        toast.success(isAr ? "تم النسخ" : "Copied")
                      }}
                    >
                      <Copy className="me-2 h-4 w-4" />
                      {isAr ? "نسخ" : "Copy"}
                    </Button>
                  </div>

                  {infoRow({
                    icon: <Mail className="h-4 w-4" />,
                    label: isAr ? "البريد الإلكتروني" : "Email",
                    value: player?.email || "N/A",
                    action: (
                      <Button
                        variant="outline"
                        className="rounded-2xl bg-transparent"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(player?.email || ""))
                          toast.success(isAr ? "تم النسخ" : "Copied")
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    ),
                  })}

                  {infoRow({
                    icon: <Phone className="h-4 w-4" />,
                    label: isAr ? "رقم الهاتف للاتصال" : "Phone",
                    value: player?.phone || "N/A",
                  })}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-border/60 bg-background/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{isAr ? "الملعب" : "Court"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {infoRow({
                    icon: <Building2 className="h-4 w-4" />,
                    label: isAr ? "اسم الملعب" : "Court name",
                    value: court?.name || "—",
                    secondary: court?.sportLabel ? (isAr ? `الرياضة: ${court.sportLabel}` : `Sport: ${court.sportLabel}`) : undefined,
                  })}

                  {infoRow({
                    icon: <MapPin className="h-4 w-4" />,
                    label: isAr ? "الموقع" : "Location",
                    value: court?.city || "—",
                    secondary: court?.address || "—",
                    action: (
                      <Button
                        variant="outline"
                        className="rounded-2xl bg-transparent"
                        size="sm"
                        onClick={() => {
                          const loc = courtsById.get(String(b.courtId))?.location || ""
                          if (loc) {
                            navigator.clipboard?.writeText(String(loc))
                            toast.success(isAr ? "تم نسخ رابط الموقع" : "Location copied")
                          } else {
                            toast.error(isAr ? "لا يوجد رابط موقع" : "No location link")
                          }
                        }}
                      >
                        <Copy className="me-2 h-4 w-4" />
                        {isAr ? "نسخ" : "Copy"}
                      </Button>
                    ),
                  })}

                  {infoRow({
                    icon: <Users className="h-4 w-4" />,
                    label: isAr ? "المدير المسؤول" : "Assigned manager",
                    value: court?.managerName || "—",
                    secondary: court?.managerId ? `ID: ${court.managerId}` : undefined,
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Card className="rounded-3xl border-border/60 bg-background/60 lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{isAr ? "تفاصيل الحجز" : "Booking"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {infoRow({
                      icon: <CalendarDays className="h-4 w-4" />,
                      label: isAr ? "التاريخ" : "Date",
                      value: formatDate(String(b.date || todayISO), language),
                      secondary: `ISO: ${String(b.date || "")}`,
                    })}
                    {infoRow({
                      icon: <Clock className="h-4 w-4" />,
                      label: isAr ? "الوقت" : "Time",
                      value: formatTimeRange(b.startTime, b.endTime),
                    })}
                    {infoRow({
                      icon: <ArrowUpDown className="h-4 w-4" />,
                      label: isAr ? "الحالة" : "Status",
                      value: getStatusLabel(status, language),
                      secondary: `raw: ${status}`,
                    })}
                    {infoRow({
                      icon: <Receipt className="h-4 w-4" />,
                      label: isAr ? "ملاحظات" : "Notes",
                      value: b.notes || b.note || (isAr ? "لا يوجد" : "None"),
                    })}
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{isAr ? "إدارة الحجز" : "Manage Booking"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button className="rounded-2xl" size="sm" asChild>
                        <Link href="/dashboard/admin/bookings">
                          <ArrowRight className="me-2 h-4 w-4" />
                          {isAr ? "الذهاب لصفحة الحجوزات" : "Go to Bookings Page"}
                        </Link>
                      </Button>
                      <Button variant="outline" className="rounded-2xl bg-transparent" size="sm" onClick={() => {
                        if (checkInCode) {
                          navigator.clipboard?.writeText(String(checkInCode))
                          toast.success(isAr ? "تم نسخ كود الحضور" : "Check-in code copied")
                        } else {
                          toast.error(isAr ? "لا يوجد كود حضور" : "No code")
                        }
                      }}>
                        <Copy className="me-2 h-4 w-4" />
                        {isAr ? "نسخ كود الحضور" : "Copy check-in code"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-border/60 bg-background/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{isAr ? "الحضور والمبلغ" : "Check-in & amount"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {infoRow({
                    icon: <Copy className="h-4 w-4" />,
                    label: isAr ? "كود الحضور" : "Check-in code",
                    value: checkInCode ? String(checkInCode) : (isAr ? "غير متوفر" : "Not available"),
                    action: checkInCode ? (
                      <Button
                        variant="outline"
                        className="rounded-2xl bg-transparent"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(checkInCode))
                          toast.success(isAr ? "تم نسخ الكود" : "Code copied")
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    ) : undefined,
                  })}

                  {infoRow({
                    icon: <Banknote className="h-4 w-4" />,
                    label: isAr ? "المبلغ" : "Amount",
                    value: formatMoneyEGP(amount, language),
                    secondary: isAr ? "قيمة الحجز" : "Booking amount",
                  })}

                  {infoRow({
                    icon: <Receipt className="h-4 w-4" />,
                    label: isAr ? "طريقة السداد" : "Settlement method",
                    value: settlementMethod,
                    secondary: isAr ? "عادة داخل الملعب" : "Usually on-site",
                  })}

                  {infoRow({
                    icon: <BadgeCheck className="h-4 w-4" />,
                    label: isAr ? "تم تسجيل الحضور" : "Checked in",
                    value: checkedInLabel,
                  })}
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="rounded-2xl bg-transparent"
              onClick={() => setDetailsOpen(false)}
            >
              {isAr ? "إغلاق" : "Close"}
            </Button>
            <Button
              className="rounded-2xl"
              onClick={() => {
                setDetailsOpen(false)
                setTab("payments")
              }}
            >
              <ArrowRight className="me-2 h-4 w-4" />
              {isAr ? "عرض الملخص المالي" : "Go to revenue summary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const renderUsersTab = () => {
    const isAr = language === "ar"

    return (
      <div className="space-y-5">
        <SectionHeader
          title={isAr ? "المستخدمون" : "Users"}
          desc={isAr ? "ابحث عن المستخدمين وصفِّهم حسب الدور والحالة" : "Find users and filter by role and status"}
          right={
            <Button className="rounded-2xl" asChild>
              <Link href="/dashboard/admin/users">
                <Users className="me-2 h-4 w-4" />
                {isAr ? "إدارة كاملة" : "Manage Users"}
              </Link>
            </Button>
          }
        />

        <Card className="rounded-3xl border-border/60 bg-background/60 backdrop-blur">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isAr ? "ابحث بالاسم/البريد/الهاتف" : "Search by name/email/phone"}
                  className="rounded-2xl ps-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={userRole} onValueChange={setUserRole}>
                  <SelectTrigger className="w-[200px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "الدور" : "Role"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="player">{isAr ? "لاعب" : "Player"}</SelectItem>
                    <SelectItem value="manager">{isAr ? "مدير" : "Manager"}</SelectItem>
                    <SelectItem value="admin">{isAr ? "أدمن" : "Admin"}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  className="rounded-2xl bg-transparent"
                  onClick={() => {
                    setUserSearch("")
                    setUserRole("all")
                    toast.success(isAr ? "تمت إعادة الضبط" : "Reset")
                  }}
                >
                  <RefreshCw className="me-2 h-4 w-4" />
                  {isAr ? "إعادة ضبط" : "Reset"}
                </Button>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <EmptyHint icon={<Users className="h-5 w-5" />} title={isAr ? "لا نتائج" : "No results"} desc={isAr ? "غيّر البحث أو الفلاتر" : "Adjust search or filters"} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/60">
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="whitespace-nowrap">{isAr ? "المستخدم" : "User"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "البريد" : "Email"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "الهاتف" : "Phone"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "الدور" : "Role"}</TableHead>
                        <TableHead className="whitespace-nowrap text-end">{isAr ? "إجراءات" : "Actions"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.slice(0, 12).map((u: any) => {
                        const name = String(u.fullName || u.name || u.username || u.email || "—")
                        const role = String(u.role || u.type || "user")

                        return (
                          <TableRow key={String(u.id || name)} className="hover:bg-muted/20">
                            <TableCell className="min-w-[220px]">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 ring-1 ring-border/60">
                                  <AvatarImage src={u.avatar || "/placeholder-user.jpg"} />
                                  <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{name}</p>
                                  <p className="truncate text-xs text-muted-foreground">ID: {String(u.id || "").slice(0, 10)}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{u.email || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{u.phone || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline" className="rounded-2xl">
                                {role}
                              </Badge>
                            </TableCell>
                           <TableCell className="whitespace-nowrap text-end">
                              <Button variant="outline" className="rounded-2xl bg-transparent" size="sm" asChild>
                                <Link href="/dashboard/admin/users">
                                  {isAr ? "إدارة" : "Manage"}
                                  <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderCourtsTab = () => {
    const isAr = language === "ar"

    return (
      <div className="space-y-5">
        <SectionHeader
          title={isAr ? "الملاعب" : "Courts"}
          desc={isAr ? "ابحث عن الملاعب وصفِّها حسب الحالة" : "Find courts and filter by status"}
          right={
            <Button asChild className="rounded-2xl">
              <Link href="/dashboard/admin/courts">
                <Building2 className="me-2 h-4 w-4" />
                {isAr ? "فتح الصفحة" : "Open page"}
              </Link>
            </Button>
          }
        />

        <Card className="rounded-3xl border-border/60 bg-background/60 backdrop-blur">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={courtSearch}
                  onChange={(e) => setCourtSearch(e.target.value)}
                  placeholder={isAr ? "ابحث بالاسم/المدينة" : "Search name/city"}
                  className="rounded-2xl ps-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={courtStatus} onValueChange={setCourtStatus}>
                  <SelectTrigger className="w-[200px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "الحالة" : "Status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="active">{isAr ? "نشط" : "Active"}</SelectItem>
                    <SelectItem value="inactive">{isAr ? "غير نشط" : "Inactive"}</SelectItem>
                    <SelectItem value="maintenance">{isAr ? "صيانة" : "Maintenance"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredCourts.length === 0 ? (
              <EmptyHint icon={<Building2 className="h-5 w-5" />} title={isAr ? "لا نتائج" : "No results"} desc={isAr ? "غيّر البحث أو الحالة" : "Adjust search or status"} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredCourts.slice(0, 9).map((c: any) => (
                  <Card key={String(c.id)} className="rounded-3xl border-border/60 bg-background/60">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black">{language === "ar" ? c.name : c.nameEn || c.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            <MapPin className="me-1 inline h-4 w-4" />
                            {language === "ar" ? c.city : c.cityEn || c.city}
                          </p>
                        </div>
                        <StatusBadge variant={statusTone(String(c.status || "inactive")) as any} dot>
                          {String(c.status || "inactive")}
                        </StatusBadge>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-[11px] text-muted-foreground">{isAr ? "رياضة" : "Sport"}</p>
                          <p className="truncate text-sm font-semibold">
                            {((sportTypes as any)[c.sportType]?.[language] || (sportTypes as any)[c.sportType]?.en || c.sportType || "—") as any}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-[11px] text-muted-foreground">{isAr ? "مدير" : "Manager"}</p>
                          <p className="truncate text-sm font-semibold">
                            {language === "ar" ? c.managerNameAr || c.managerName || "—" : c.managerNameEn || c.managerName || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button asChild className="rounded-2xl" size="sm">
                          <Link href="/dashboard/admin/courts">
                            {isAr ? "إدارة الملعب" : "Manage Court"}
                            <ArrowRight className="ms-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderRevenueTab = () => {
    const isAr = language === "ar"

    return (
      <div className="space-y-5">
        <SectionHeader
          title={isAr ? "إيراد اللعب" : "Played revenue"}
          desc={isAr ? "مبالغ الحجوزات التي تم تسجيل حضورها أو إكمالها فقط" : "Revenue from checked-in and completed bookings only"}

        />

        <DashboardStatGrid>
          <StatCard
            icon={<Banknote className="h-4 w-4" />}
            label={isAr ? "إيراد اللعب" : "Played revenue"}
            value={formatMoneyEGP(revenueKpis.estimatedRevenue, language)}
            tone="success"
          />
          <StatCard
            icon={<BadgeCheck className="h-4 w-4" />}
            label={isAr ? "حضور" : "Checked in"}
            value={revenueKpis.checkedInBookings.length}
            subLabel={formatMoneyEGP(revenueKpis.checkedInAmount, language)}
            tone="warning"
          />
          <StatCard
            icon={<CheckCircle className="h-4 w-4" />}
            label={isAr ? "مكتمل" : "Completed"}
            value={revenueKpis.completedBookings.length}
            tone="info"
          />
          <StatCard
            icon={<Receipt className="h-4 w-4" />}
            label={isAr ? "المتوسط" : "Average"}
            value={formatMoneyEGP(revenueKpis.averageBooking, language)}
            tone="primary"
          />
        </DashboardStatGrid>

        <Card className="rounded-3xl border-border/60 bg-background/60 backdrop-blur">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={paySearch}
                  onChange={(e) => setPaySearch(e.target.value)}
                  placeholder={isAr ? "ابحث برقم الحجز / اللاعب / الملعب / الطريقة" : "Search booking / player / court / method"}
                  className="rounded-2xl ps-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={payStatus} onValueChange={setPayStatus}>
                  <SelectTrigger className="w-[210px] rounded-2xl">
                    <SelectValue placeholder={isAr ? "حالة الدفع" : "Payment Status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="paid">{isAr ? "مدفوع" : "Paid"}</SelectItem>
                    <SelectItem value="pending">{isAr ? "غير مدفوع" : "Unpaid"}</SelectItem>
                    <SelectItem value="refunded">{isAr ? "مسترد" : "Refunded"}</SelectItem>
                    <SelectItem value="failed">{isAr ? "فشل" : "Failed"}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  className="rounded-2xl bg-transparent"
                  onClick={() => {
                    setPaySearch("")
                    setPayStatus("all")
                    toast.success(isAr ? "تمت إعادة الضبط" : "Reset")
                  }}
                >
                  <RefreshCw className="me-2 h-4 w-4" />
                  {isAr ? "إعادة ضبط" : "Reset"}
                </Button>
              </div>
            </div>

            {filteredRevenueRows.length === 0 ? (
              <EmptyHint
                icon={<Banknote className="h-5 w-5" />}
                title={isAr ? "لا توجد نتائج" : "No results"}
                desc={isAr ? "جرّب البحث أو الفلاتر" : "Try search or filters"}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/60">
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="whitespace-nowrap">{isAr ? "الحالة" : "Status"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "رقم الحجز" : "Booking ID"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "اللاعب" : "Player"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "الملعب" : "Court"}</TableHead>
                        <TableHead className="whitespace-nowrap">{isAr ? "الطريقة" : "Method"}</TableHead>
                        <TableHead className="whitespace-nowrap text-end">{isAr ? "المبلغ" : "Amount"}</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredRevenueRows.slice(0, 12).map((b: any) => {
                        const pStatus = String(b.paymentStatus || "pending")
                        const amount = getBookingAmount(b)
                        const player = getPlayerInfo(b)
                        const court = getCourtInfo(b)
                        const method = String(b.paymentMethod || (isAr ? "في الملعب" : "On-site"))

                        return (
                          <TableRow key={String(b.id)} className="hover:bg-muted/20">
                            <TableCell className="whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-2xl",
                                  paymentTone(pStatus) === "success" ? "border-success/40 bg-success/10 text-success" : "",
                                  paymentTone(pStatus) === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "",
                                  paymentTone(pStatus) === "secondary" ? "border-border bg-muted/50 text-muted-foreground" : ""
                                )}
                              >
                                {getPaymentLabel(pStatus, language)}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <p className="font-semibold">#{String(b.id || "—").slice(0, 10)}</p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{player.name}</TableCell>
                            <TableCell className="whitespace-nowrap">{court.name}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline" className="rounded-2xl">
                                {method}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-end font-semibold">
                              {formatMoneyEGP(amount, language)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {isAr
                ? "هذا القسم يعرض مبالغ الحجوزات التي تم تسجيل حضورها أو استكمالها فقط لأن النظام الحالي بدون بوابة دفع إلكترونية."
                : "This section shows booking amounts for checked-in and completed bookings only because the current system does not use an online payment gateway."}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (dashboardLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            {language === "ar" ? "جاري التحميل..." : "Loading..."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      {dashboardError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {dashboardError}
        </div>
      ) : null}

      {renderHero()}
      {renderTopTabs()}
    </div>
  )
}
