"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  XCircle,
  Radio,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useIsMobile } from "@/components/ui/use-mobile"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { listCourts, listBookings, managerGetDashboardStats } from "@/lib/api"
import { format12h, timeToMinutes } from "@/lib/time"
import { formatEgyptISODate, getEgyptNow, getAbsoluteBookingTimes } from "@/lib/date"

import { cn } from "@/lib/utils"
import { DashboardWelcomeCard } from "@/components/dashboard/shared/dashboard-welcome-card"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

// -----------------------------
// Types + Date Helpers (LOCAL, cross-browser safe)
// -----------------------------
type Period = "today" | "7d" | "30d"
type ManagerDashboardStats = Awaited<ReturnType<typeof managerGetDashboardStats>>

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function parseISODateParts(iso: string) {
  const [rawYear, rawMonth, rawDay] = String(iso || "").split("-")
  return {
    year: Number(rawYear) || 1970,
    month: Number(rawMonth) || 1,
    day: Number(rawDay) || 1,
  }
}

function isoLocal(d: Date) {
  return formatEgyptISODate(d)
}

function fromISO(iso: string) {
  const { year, month, day } = parseISODateParts(iso)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

function getMonthStartISO(iso: string) {
  const { year, month } = parseISODateParts(iso)
  return `${year}-${pad2(month)}-01`
}

function getMonthKey(iso: string) {
  const { year, month } = parseISODateParts(iso)
  return `${year}-${pad2(month)}`
}

function getMonthRangeISO(iso: string) {
  const { year, month } = parseISODateParts(iso)
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0)).getUTCDate()

  return {
    dateFrom: `${year}-${pad2(month)}-01`,
    dateTo: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  }
}

function addDaysISO(iso: string, days: number) {
  const d = fromISO(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}
function isSameDayISO(iso: string, date: Date) {
  return iso === isoLocal(date)
}
function startOfDay(d: Date) {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setUTCHours(23, 59, 59, 999)
  return x
}
function inRange(bookingISO: string, from: Date, to: Date) {
  const bookingTime = fromISO(bookingISO).getTime()
  return bookingTime >= startOfDay(from).getTime() && bookingTime <= endOfDay(to).getTime()
}
function getRange(period: Period) {
  const todayISO = formatEgyptISODate(new Date())
  const to = endOfDay(fromISO(todayISO))
  const from = startOfDay(fromISO(todayISO))
  if (period === "today") return { from, to }
  if (period === "7d") {
    from.setUTCDate(from.getUTCDate() - 6)
    return { from, to }
  }
  from.setUTCDate(from.getUTCDate() - 29)
  return { from, to }
}
function getPrevRange(period: Period) {
  const { from, to } = getRange(period)
  const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const prevTo = new Date(from.getTime() - 1)
  prevTo.setUTCHours(23, 59, 59, 999)

  const prevFrom = new Date(prevTo)
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1))
  prevFrom.setUTCHours(0, 0, 0, 0)

  return { from: prevFrom, to: prevTo }
}
function fmtShort(d: Date, lang: string) {
  return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    timeZone: "Africa/Cairo",
    month: "short",
    day: "2-digit",
  })
}
function fmtMonthYear(d: Date, lang: string) {
  return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    timeZone: "Africa/Cairo",
    month: "long",
    year: "numeric",
  })
}

function mergeBookingsById(existing: any[], incoming: any[]) {
  const merged = new Map<string, any>()

  existing.forEach((booking) => {
    if (booking?.id != null) {
      merged.set(String(booking.id), booking)
    }
  })

  incoming.forEach((booking) => {
    if (booking?.id != null) {
      merged.set(String(booking.id), booking)
    }
  })

  return Array.from(merged.values()).sort((a, b) => {
    const dateCompare = String(a?.date || "").localeCompare(String(b?.date || ""))
    if (dateCompare !== 0) return dateCompare

    const timeCompare = timeToMinutes(String(a?.startTime || "00:00")) - timeToMinutes(String(b?.startTime || "00:00"))
    if (timeCompare !== 0) return timeCompare

    return String(a?.id || "").localeCompare(String(b?.id || ""))
  })
}

async function fetchManagerBookingsForMonth(monthISO: string) {
  const { dateFrom, dateTo } = getMonthRangeISO(monthISO)
  const bookingParams = {
    limit: 200,
    dateFrom,
    dateTo,
    sortBy: "date" as const,
    order: "desc" as const,
  }

  const firstPage = await listBookings({
    page: 1,
    ...bookingParams,
  })

  const firstItems = Array.isArray(firstPage) ? firstPage : (firstPage?.items || [])
  const bookingPages = Math.max(1, Number((firstPage as any)?.pages || 1))
  let managedBookings = [...firstItems]

  for (let currentPage = 2; currentPage <= bookingPages; currentPage += 1) {
    const pageRes = await listBookings({
      page: currentPage,
      ...bookingParams,
    })
    const pageItems = Array.isArray(pageRes) ? pageRes : (pageRes?.items || [])
    managedBookings = managedBookings.concat(pageItems)
  }

  return managedBookings
}
function clampPct(n: number) {
  return Math.min(100, Math.max(0, n))
}
function isBookingActiveNow(booking: any) {
  if (!booking?.date || !booking?.startTime || !booking?.endTime) return false
  if (booking.status === "cancelled") return false

  const openRef = booking.sessionOpenTime || booking.court?.openTime || "08:00"
  const useOpeningDay = booking.useOpeningDayForOvernightBookings === true

  const { startMs, endMs } = getAbsoluteBookingTimes(
    booking.date,
    booking.startTime,
    booking.endTime,
    openRef,
    useOpeningDay,
  )
  const nowMs = Date.now()

  return nowMs >= startMs && nowMs < endMs
}

// -----------------------------
// Small UI Utilities
// -----------------------------
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted/50", className)} />
}

function useHorizontalSwipe(opts: { onLeft: () => void; onRight: () => void; threshold?: number }) {
  const { onLeft, onRight, threshold = 42 } = opts
  const sx = useRef<number | null>(null)
  const sy = useRef<number | null>(null)

  const start = (x: number, y: number) => {
    sx.current = x
    sy.current = y
  }
  const end = (x: number, y: number) => {
    if (sx.current === null || sy.current === null) return
    const dx = x - sx.current
    const dy = y - sy.current
    sx.current = null
    sy.current = null
    if (Math.abs(dx) < threshold) return
    if (Math.abs(dy) > Math.abs(dx) * 0.8) return
    if (dx < 0) onLeft()
    else onRight()
  }

  return {
    onTouchStart: (e: React.TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: (e: React.TouchEvent) => {
      const t = e.changedTouches[0]
      end(t.clientX, t.clientY)
    },
    onMouseDown: (e: React.MouseEvent) => start(e.clientX, e.clientY),
    onMouseUp: (e: React.MouseEvent) => end(e.clientX, e.clientY),
  }
}

// -----------------------------
// Period selector (clean + mobile friendly, no dead space)
// -----------------------------
function PeriodPills({
  language,
  value,
  onChange,
  from,
  to,
  isLoading,
}: {
  language: string
  value: Period
  onChange: (p: Period) => void
  from: Date
  to: Date
  isLoading?: boolean
}) {
  const isAr = language === "ar"
  const items: Array<{ id: Period; label: string }> = [
    { id: "today", label: isAr ? "اليوم" : "Today" },
    { id: "7d", label: isAr ? "7 أيام" : "7d" },
    { id: "30d", label: isAr ? "30 يوم" : "30d" },
  ]

  return (
    <Card className="rounded-3xl border-border/50 bg-card/40 backdrop-blur overflow-hidden shadow-smooth">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-extrabold text-[clamp(0.95rem,2vw,1.1rem)] truncate">{isAr ? "الفترة" : "Period"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {fmtShort(from, language)} — {fmtShort(to, language)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {items.map((it) => {
              const active = it.id === value
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onChange(it.id)}
                  disabled={isLoading}
                  className={cn(
                    "h-12 rounded-2xl px-4 border text-sm font-extrabold transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    "active:scale-[0.99] motion-reduce:transition-none",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card/50 border-border/60 hover:bg-card hover:border-primary/25",
                  )}
                  style={{ minHeight: 48 }}
                >
                  {it.label}
                </button>
              )
            })}
          </div>
        </div>

        {isLoading && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>{isAr ? "جاري تحديث البيانات..." : "Refreshing data..."}</span>
            </div>
            <Progress value={55} className="h-2 mt-2" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// -----------------------------
// KPI cards (mobile: horizontal snap strip / desktop: grid)
// -----------------------------
function KPICompactCard({
  title,
  value,
  suffix,
  icon: Icon,
  tone = "primary",
  sub,
  loading,
}: {
  title: string
  value: string
  suffix?: string
  icon: any
  tone?: "primary" | "success" | "warning" | "info"
  sub?: string
  loading?: boolean
}) {
  const tones = {
    primary: "from-primary/14 via-primary/6 to-transparent border-primary/20",
    success: "from-success/14 via-success/6 to-transparent border-success/20",
    warning: "from-warning/14 via-warning/6 to-transparent border-warning/20",
    info: "from-info/14 via-info/6 to-transparent border-info/20",
  }
  const iconTones = {
    primary: "bg-primary/18 text-primary",
    success: "bg-success/18 text-success",
    warning: "bg-warning/18 text-warning",
    info: "bg-info/18 text-info",
  }

  return (
    <Card className={cn("overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm", tones[tone])}>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-muted-foreground sm:text-xs">{title}</p>
            {loading ? (
              <Skeleton className="mt-1.5 h-7 w-20 rounded-md" />
            ) : (
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-black tabular-nums sm:text-2xl">{value}</span>
                {suffix ? <span className="text-[10px] font-semibold text-muted-foreground sm:text-xs">{suffix}</span> : null}
              </div>
            )}
            {sub ? <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground sm:text-[11px]">{sub}</p> : null}
          </div>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10", iconTones[tone])}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function KPIStrip({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 start-0 w-8 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-background to-transparent" />
      <div
        className={cn(
          "flex gap-3 overflow-x-auto pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "snap-x snap-mandatory",
        )}
      >
        {children}
      </div>
    </div>
  )
}

// -----------------------------
// Action Center (clean)
// -----------------------------
function ActionCenter({
  isAr,
  todayCount,
  cancelledCount,
}: {
  isAr: boolean
  todayCount: number
  cancelledCount: number
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-base font-bold">{isAr ? "إجراءات سريعة" : "Quick actions"}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-2.5 p-4">
        <div className="rounded-xl border border-success/25 bg-success/8 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="font-extrabold">{isAr ? "حجوزات اليوم" : "Today Bookings"}</p>
            </div>
            <Badge variant="outline" className="h-8 rounded-xl bg-success/15 text-success border-success/20 px-3">
              {todayCount}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {isAr ? "سجّل حضور اللاعبين للحجوزات المؤكدة اليوم." : "Check in players for today's confirmed bookings."}
          </p>
          <Button className="mt-2.5 h-10 w-full rounded-xl" size="sm" asChild>
            <Link href="/dashboard/manager/check-in">
              <CheckCircle2 className="me-2 h-5 w-5" />
              <span className="font-semibold">{isAr ? "تسجيل الحضور الآن" : "Check-in Now"}</span>
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-destructive/25 bg-destructive/8 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <p className="font-extrabold">{isAr ? "إلغاءات" : "Cancellations"}</p>
            </div>
            <Badge variant="outline" className="h-8 rounded-xl bg-destructive/15 text-destructive border-destructive/20 px-3">
              {cancelledCount}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {isAr ? "اطّلع على الحجوزات الملغاة اليوم." : "See bookings cancelled today."}
          </p>
          <Button variant="outline" className="mt-2.5 h-10 w-full rounded-xl" size="sm" asChild>
            <Link href="/dashboard/manager/bookings">
              <CalendarDays className="me-2 h-5 w-5" />
              <span className="font-semibold">{isAr ? "عرض الحجوزات" : "View Bookings"}</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// -----------------------------
// Modern calendar (month grid + agenda) with PAGINATION on selected day
// - Mobile agenda: first 3 items + pagination controls
// - Touch swipe month navigation
// - Clean header layout optimized for small screens
// -----------------------------
function ModernScheduleCalendar({
  language,
  selectedISO,
  onSelectISO,
  onMonthISOChange,
  bookings,
  courtsById,
  now,
  loading,
  pageSize,
}: {
  language: string
  selectedISO: string
  onSelectISO: (iso: string) => void
  onMonthISOChange?: (iso: string) => void
  bookings: any[]
  courtsById: Record<string, any>
  now: Date
  loading?: boolean
  pageSize: number
}) {
  const isAr = language === "ar"
  const isMobileLocal = useIsMobile()
  const weekStartsOn = isAr ? 6 : 0 // Sat for Arabic, Sun for English

  const [monthISO, setMonthISO] = useState(() => getMonthStartISO(selectedISO))

  useEffect(() => {
    setMonthISO(getMonthStartISO(selectedISO))
  }, [selectedISO])

  useEffect(() => {
    onMonthISOChange?.(monthISO)
  }, [monthISO, onMonthISOChange])

  const monthDate = useMemo(() => fromISO(monthISO), [monthISO])
  const monthLabel = useMemo(() => fmtMonthYear(monthDate, language), [monthDate, language])

  const weekdays = useMemo(() => {
    const base = new Date(Date.UTC(2024, 0, 7, 12, 0, 0, 0))
    const start = new Date(base)
    const delta = (weekStartsOn - start.getUTCDay() + 7) % 7
    start.setUTCDate(start.getUTCDate() + delta)
    const fmt = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
      weekday: "short",
      timeZone: "Africa/Cairo",
    })
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      return fmt.format(d)
    })
  }, [isAr, weekStartsOn])

  const monthMatrix = useMemo(() => {
    const first = new Date(monthDate)
    first.setUTCDate(1)
    const offset = (first.getUTCDay() - weekStartsOn + 7) % 7
    const start = new Date(first)
    start.setUTCDate(start.getUTCDate() - offset)
    return Array.from({ length: 42 }).map((_, i) => {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      return d
    })
  }, [monthDate, weekStartsOn])

  const isInDisplayedMonth = (d: Date) =>
    d.getUTCMonth() === monthDate.getUTCMonth() && d.getUTCFullYear() === monthDate.getUTCFullYear()

  const eventsByISO = useMemo(() => {
    const map = new Map<string, any[]>()
    bookings.forEach((b) => {
      if (!b?.date || b.status === "cancelled") return
      const arr = map.get(b.date) || []
      arr.push(b)
      map.set(b.date, arr)
    })
    map.forEach((arr, k) => {
      arr.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      map.set(k, arr)
    })
    return map
  }, [bookings])

  const selectedBookings = useMemo(() => (eventsByISO.get(selectedISO) || []).slice(), [eventsByISO, selectedISO])

  const todayISO = isoLocal(now)

  // Month nav
  const goPrevMonth = () => {
    const d = new Date(monthDate)
    d.setUTCMonth(d.getUTCMonth() - 1)
    d.setUTCDate(1)
    setMonthISO(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`)
  }
  const goNextMonth = () => {
    const d = new Date(monthDate)
    d.setUTCMonth(d.getUTCMonth() + 1)
    d.setUTCDate(1)
    setMonthISO(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`)
  }

  // Day nav (fixed across months)
  const goPrevDay = () => onSelectISO(addDaysISO(selectedISO, -1))
  const goNextDay = () => onSelectISO(addDaysISO(selectedISO, +1))

  const swipe = useHorizontalSwipe({
    onLeft: () => (isAr ? goPrevMonth() : goNextMonth()),
    onRight: () => (isAr ? goNextMonth() : goPrevMonth()),
  })

  // Details modal
  const [openId, setOpenId] = useState<string | null>(null)
  const openBooking = useMemo(
    () => selectedBookings.find((b) => String(b.id) === String(openId)),
    [selectedBookings, openId],
  )

  // -------- Agenda pagination (REQUIRED)
  const [agendaPage, setAgendaPage] = useState(0)
  useEffect(() => {
    setAgendaPage(0)
  }, [selectedISO])

  const totalPages = Math.max(1, Math.ceil(selectedBookings.length / Math.max(1, pageSize)))
  const safePage = Math.min(agendaPage, totalPages - 1)
  useEffect(() => {
    if (agendaPage !== safePage) setAgendaPage(safePage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage])

  const pagedBookings = useMemo(() => {
    const start = safePage * pageSize
    const end = start + pageSize
    return selectedBookings.slice(start, end)
  }, [selectedBookings, safePage, pageSize])

  const statusLabel = (s: string) => {
    const normalizedStatus = String(s || "confirmed").toLowerCase() === "pending" ? "confirmed" : String(s || "confirmed").toLowerCase()
    const map: Record<string, { ar: string; en: string }> = {
      confirmed: { ar: "مؤكد", en: "Confirmed" },
      completed: { ar: "مكتمل", en: "Completed" },
      cancelled: { ar: "ملغي", en: "Cancelled" },
      no_show: { ar: "لم يحضر", en: "Missed booking" },
    }
    return map[normalizedStatus]?.[isAr ? "ar" : "en"] ?? normalizedStatus
  }

  const statusTone = (s: string) => {
    const normalizedStatus = String(s || "confirmed").toLowerCase() === "pending" ? "confirmed" : String(s || "confirmed").toLowerCase()
    if (normalizedStatus === "confirmed") return "bg-success/12 text-success border-success/20"
    if (normalizedStatus === "completed") return "bg-info/12 text-info border-info/20"
    if (normalizedStatus === "cancelled" || normalizedStatus === "no_show") {
      return "bg-destructive/12 text-destructive border-destructive/20"
    }
    return "bg-muted/40 text-muted-foreground border-border/60"
  }

  // Visual indicators (today’s selected day chips)
  const importantCounts = useMemo(() => {
    const egyptNow = getEgyptNow()
    const nowMin = egyptNow.totalMinutes
    const soon = nowMin + 60
    let soonStarts = 0
    let live = 0
    selectedBookings.forEach((b) => {
      if (isBookingActiveNow(b)) live++
      const s = timeToMinutes(b.startTime)
      if (isSameDayISO(selectedISO, new Date()) && s >= nowMin && s <= soon) soonStarts++
    })
    return { soonStarts, live, total: selectedBookings.length }
  }, [selectedBookings, selectedISO])

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="space-y-3 border-b border-border/50 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-bold">{isAr ? "الجدول" : "Schedule"}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelectISO(todayISO)}
            className="h-9 rounded-xl"
            disabled={loading}
          >
            {isAr ? "اليوم" : "Today"}
          </Button>
        </div>

        {/* Month row */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={goPrevMonth}
            className="h-12 w-12 rounded-2xl p-0 bg-card/50"
            style={{ minWidth: 48, minHeight: 48 }}
            aria-label={isAr ? "الشهر السابق" : "Previous month"}
            disabled={loading}
          >
            {isAr ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>

          <div className="h-12 flex-1 rounded-2xl border border-border/60 bg-card/50 px-4 flex items-center justify-center min-w-0">
            <span className="font-extrabold text-sm truncate">{monthLabel}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={goNextMonth}
            className="h-12 w-12 rounded-2xl p-0 bg-card/50"
            style={{ minWidth: 48, minHeight: 48 }}
            aria-label={isAr ? "الشهر التالي" : "Next month"}
            disabled={loading}
          >
            {isAr ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
        </div>

        {/* Selected day row */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={goPrevDay}
            className="h-12 w-12 rounded-2xl p-0 bg-card/50"
            style={{ minWidth: 48, minHeight: 48 }}
            aria-label={isAr ? "اليوم السابق" : "Previous day"}
            disabled={loading}
          >
            {isAr ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </Button>

          <div className="h-12 flex-1 rounded-2xl border border-border/60 bg-card/50 px-4 flex items-center justify-center gap-2 min-w-0">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-extrabold text-sm truncate">
              {fromISO(selectedISO).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                timeZone: "Africa/Cairo",
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={goNextDay}
            className="h-12 w-12 rounded-2xl p-0 bg-card/50"
            style={{ minWidth: 48, minHeight: 48 }}
            aria-label={isAr ? "اليوم التالي" : "Next day"}
            disabled={loading}
          >
            {isAr ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary" className="rounded-full">
            {isAr ? "جاري" : "Live"} {importantCounts.live}
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {isAr ? "قريب" : "Soon"} {importantCounts.soonStarts}
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {isAr ? "اليوم" : "Day"} {importantCounts.total}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5" {...swipe}>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 sm:p-3">
          <div className="grid grid-cols-7 gap-2 sm:gap-2.5">
            {weekdays.map((w, i) => (
              <div key={i} className="text-center text-[11px] sm:text-xs font-extrabold text-muted-foreground">
                {w}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2 sm:gap-2.5">
            {monthMatrix.map((d) => {
              const iso = isoLocal(d)
              const inMonth = isInDisplayedMonth(d)
              const isSelected = iso === selectedISO
              const isToday = iso === todayISO
              const dayEvents = eventsByISO.get(iso) || []


              const hasLive = dayEvents.some((b) => isBookingActiveNow(b))
              const hasAny = dayEvents.length > 0

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => onSelectISO(iso)}
                  disabled={loading}
                  className={cn(
                    "relative rounded-2xl border transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    "active:scale-[0.98] motion-reduce:transition-none",
                    "min-h-[48px] min-w-[48px] aspect-square",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background/40 border-border/60 hover:bg-card hover:border-primary/25",
                    !inMonth && !isSelected && "opacity-55",
                  )}
                  aria-current={isSelected ? "date" : undefined}
                >
                  <div className="absolute top-2 start-2 text-xs sm:text-sm font-extrabold">
                    {d.toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                      timeZone: "Africa/Cairo",
                      day: "numeric",
                    })}
                  </div>

                  {isToday && !isSelected && <div className="absolute inset-1 rounded-2xl ring-2 ring-primary/25" />}

                  <div className="absolute bottom-2 start-2 flex items-center gap-1.5">
                    {hasLive && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-success")} />}
                    {hasAny && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground/70" : "bg-primary/70")} />}
                  </div>

                  {dayEvents.length > 0 && (
                    <div
                      className={cn(
                        "absolute bottom-2 end-2 h-6 min-w-[24px] px-1 rounded-xl text-[11px] font-extrabold flex items-center justify-center border",
                        isSelected
                          ? "bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20"
                          : "bg-muted/30 text-foreground border-border/50",
                      )}
                    >
                      {dayEvents.length}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Agenda (PAGINATED) */}
        <div className="rounded-3xl border border-border/60 bg-card/50 backdrop-blur overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-border/50 bg-muted/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-[clamp(1rem,2vw,1.15rem)] truncate">
                  {isAr ? "تفاصيل اليوم" : "Day agenda"}
                </p>

              </div>


            </div>
          </div>

          <div className="p-4 sm:p-5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 rounded-3xl" />
                <Skeleton className="h-16 rounded-3xl" />
                <Skeleton className="h-16 rounded-3xl" />
              </div>
            ) : selectedBookings.length === 0 ? (
              <div className="py-10 text-center">
                <CalendarDays className="h-14 w-14 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground font-semibold">{isAr ? "لا توجد حجوزات لهذا اليوم" : "No bookings for this day"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pagedBookings.map((b) => {
                  const court = courtsById[b.courtId]
                  const courtName = court ? (isAr ? court.name : court.nameEn) : b.courtId
                  const player = isAr ? b.playerName || b.userName : b.playerNameEn || b.userName
                  const amount = Number(b.totalPrice ?? b.amount ?? 0)

                  const activeNow = isBookingActiveNow(b)
                  const egyptNow = getEgyptNow()
                  const nowMin = egyptNow.totalMinutes
                  const startMin = timeToMinutes(b.startTime)
                  const startsSoon = isSameDayISO(selectedISO, new Date()) && startMin >= nowMin && startMin <= nowMin + 60

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setOpenId(String(b.id))}
                      className="w-full rounded-xl border border-border/60 bg-card p-3 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-haspopup="dialog"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-foreground" dir="ltr">
                              {format12h(b.startTime, isAr ? "ar" : "en")} — {format12h(b.endTime, isAr ? "ar" : "en")}
                            </span>

                            {activeNow && (
                              <Badge className="h-7 rounded-xl px-3 bg-success/15 text-success border border-success/20">
                                <Radio className="me-1.5 h-3.5 w-3.5 animate-pulse" />
                                {isAr ? "جاري الآن" : "Live"}
                              </Badge>
                            )}

                            {!activeNow && startsSoon && (
                              <Badge className="h-7 rounded-xl px-3 bg-primary/12 text-primary border border-primary/20">
                                <Clock className="me-1.5 h-3.5 w-3.5" />
                                {isAr ? "قريبًا" : "Soon"}
                              </Badge>
                            )}

                            <Badge className={cn("h-7 rounded-xl px-3 border", statusTone(b.status))}>
                              {statusLabel(b.status)}
                            </Badge>
                          </div>

                          <div className="mt-1.5 text-sm text-muted-foreground truncate">
                            <span className="font-semibold text-foreground/90">{courtName}</span>
                            <span className="mx-2 text-muted-foreground">•</span>
                            <span className="truncate">{player}</span>
                          </div>
                        </div>

                        <div className="shrink-0 text-end">
                          <div className="text-[clamp(1rem,2vw,1.2rem)] font-extrabold text-primary">
                            {amount.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">{isAr ? "ج.م" : "EGP"}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
                <div className="mt-4 flex items-center justify-center gap-3">
                  {isAr ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAgendaPage((p) => Math.min(totalPages - 1, p + 1))}
                        className="h-11 w-11 rounded-2xl p-0 bg-transparent"
                        style={{ minWidth: 44, minHeight: 44 }}
                        disabled={loading || safePage >= totalPages - 1}
                        aria-label={isAr ? "الصفحة التالية" : "Next page"}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                      <div className="h-11 rounded-2xl border border-border/60 bg-background/40 px-3 flex items-center justify-center">
                        <span className="text-xs font-extrabold text-foreground tabular-nums">
                          {safePage + 1}/{totalPages}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAgendaPage((p) => Math.max(0, p - 1))}
                        className="h-11 w-11 rounded-2xl p-0 bg-transparent"
                        style={{ minWidth: 44, minHeight: 44 }}
                        disabled={loading || safePage <= 0}
                        aria-label={isAr ? "الصفحة السابقة" : "Previous page"}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAgendaPage((p) => Math.max(0, p - 1))}
                        className="h-11 w-11 rounded-2xl p-0 bg-transparent"
                        style={{ minWidth: 44, minHeight: 44 }}
                        disabled={loading || safePage <= 0}
                        aria-label={isAr ? "الصفحة السابقة" : "Previous page"}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <div className="h-11 rounded-2xl border border-border/60 bg-background/40 px-3 flex items-center justify-center">
                        <span className="text-xs font-extrabold text-foreground tabular-nums">
                          {safePage + 1}/{totalPages}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAgendaPage((p) => Math.min(totalPages - 1, p + 1))}
                        className="h-11 w-11 rounded-2xl p-0 bg-transparent"
                        style={{ minWidth: 44, minHeight: 44 }}
                        disabled={loading || safePage >= totalPages - 1}
                        aria-label={isAr ? "الصفحة التالية" : "Next page"}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {isMobileLocal ? (
          <Sheet open={Boolean(openBooking)} onOpenChange={(o) => !o && setOpenId(null)}>
            <SheetContent side="bottom" className="w-full sm:max-w-xl">
              {openBooking && (
                <>
                  <SheetHeader>
                    <SheetTitle>{isAr ? "تفاصيل الحجز" : "Booking details"}</SheetTitle>
                    <SheetDescription>
                      {isAr ? "معلومات كاملة مع إجراءات سريعة" : "Full details with quick actions"}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
                      <div className="text-xs text-muted-foreground">{isAr ? "الملعب" : "Court"}</div>
                      <div className="font-extrabold mt-1">
                        {(() => {
                          const court = courtsById[openBooking.courtId]
                          return court ? (isAr ? court.name : court.nameEn) : openBooking.courtId
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1" dir="ltr">
                        {openBooking.date} • {format12h(openBooking.startTime, isAr ? "ar" : "en")} — {format12h(openBooking.endTime, isAr ? "ar" : "en")}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
                      <div className="text-xs text-muted-foreground">{isAr ? "اللاعب" : "Player"}</div>
                      <div className="font-extrabold mt-1">
                        {isAr ? openBooking.playerName || openBooking.userName : openBooking.playerNameEn || openBooking.userName}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card/50 p-4 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">{isAr ? "الحالة" : "Status"}</div>
                        <div className="mt-1">
                          <Badge className={cn("h-8 rounded-xl px-3 border", statusTone(openBooking.status))}>
                            {statusLabel(openBooking.status)}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="text-xs text-muted-foreground">{isAr ? "المبلغ" : "Amount"}</div>
                        <div className="text-xl font-extrabold text-primary mt-1">
                          {Number(openBooking.totalPrice ?? openBooking.amount ?? 0).toLocaleString()}{" "}
                          <span className="text-sm text-muted-foreground">{isAr ? "ج.م" : "EGP"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <Button className="h-12 rounded-2xl" asChild>
                        <Link href="/dashboard/manager/check-in">
                          <CheckCircle2 className="me-2 h-5 w-5" />
                          {isAr ? "تسجيل الحضور الآن" : "Check-in now"}
                        </Link>
                      </Button>

                    </div>
                  </div>
                </>
              )}
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={Boolean(openBooking)} onOpenChange={(o) => !o && setOpenId(null)}>
            <DialogContent className="sm:max-w-2xl rounded-2xl p-0 overflow-hidden">
              {openBooking && (
                <>
                  <DialogHeader className="p-4 sm:p-5 border-b border-border/60 bg-muted/10">
                    <DialogTitle>{isAr ? "تفاصيل الحجز" : "Booking details"}</DialogTitle>
                    <DialogDescription>
                      {isAr ? "معلومات كاملة وإجراءات سريعة" : "Full details and quick actions"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
                        <div className="text-xs text-muted-foreground">{isAr ? "الملعب" : "Court"}</div>
                        <div className="font-extrabold mt-1">
                          {(() => {
                            const court = courtsById[openBooking.courtId]
                            return court ? (isAr ? court.name : court.nameEn) : openBooking.courtId
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1" dir="ltr">
                          {openBooking.date} • {format12h(openBooking.startTime, isAr ? "ar" : "en")} — {format12h(openBooking.endTime, isAr ? "ar" : "en")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
                        <div className="text-xs text-muted-foreground">{isAr ? "اللاعب" : "Player"}</div>
                        <div className="font-extrabold mt-1">
                          {isAr ? openBooking.playerName || openBooking.userName : openBooking.playerNameEn || openBooking.userName}
                        </div>
                      </div>

                    </div>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-border/60 bg-card/50 p-4 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">{isAr ? "الحالة" : "Status"}</div>
                          <div className="mt-1">
                            <Badge className={cn("h-8 rounded-xl px-3 border", statusTone(openBooking.status))}>
                              {statusLabel(openBooking.status)}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="text-xs text-muted-foreground">{isAr ? "المبلغ" : "Amount"}</div>
                          <div className="text-xl font-extrabold text-primary mt-1">
                            {Number(openBooking.totalPrice ?? openBooking.amount ?? 0).toLocaleString()}{" "}
                            <span className="text-sm text-muted-foreground">{isAr ? "ج.م" : "EGP"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <Button className="h-12 rounded-2xl" asChild>
                          <Link href="/dashboard/manager/check-in">
                            <CheckCircle2 className="me-2 h-5 w-5" />
                            {isAr ? "تسجيل الحضور الآن" : "Check-in now"}
                          </Link>
                        </Button>

                      </div>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  )
}

// -----------------------------
// Main Page
// - Removed Live Court Status (as requested)
// - Calendar agenda is paginated (first 3 items on mobile)
// - Cleaner mobile layout (KPI strip + big calendar + action center)
// -----------------------------
export function ManagerDashboard() {
  const { language, t } = useLanguage()
  const { user } = useAuth()
  const isMobile = useIsMobile()

  const [period, setPeriod] = useState<Period>("today")
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [managerCourts, setManagerCourts] = useState<any[]>([])
  const [managerBookings, setManagerBookings] = useState<any[]>([])
  const [dashboardStats, setDashboardStats] = useState<ManagerDashboardStats | null>(null)

  const now = new Date()
  const todayISO = isoLocal(now)
  const [calendarMonthISO, setCalendarMonthISO] = useState<string>(() => getMonthStartISO(todayISO))
  const [loadedMonthKeys, setLoadedMonthKeys] = useState<Record<string, boolean>>({})
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshDashboardData = useCallback(async () => {
    if (!user || user.role !== "manager") return

    const targetMonthISO = calendarMonthISO || getMonthStartISO(todayISO)
    const monthKey = getMonthKey(targetMonthISO)

    setIsRefreshing(true)
    try {
      const [courtsRes, monthBookings, statsRes] = await Promise.all([
        listCourts({ page: 1, limit: 100 }),
        fetchManagerBookingsForMonth(targetMonthISO),
        managerGetDashboardStats(),
      ])

      if (!mountedRef.current) return

      const managedCourts = Array.isArray(courtsRes) ? courtsRes : (courtsRes?.items || [])
      setManagerCourts(managedCourts)
      setManagerBookings((prev) => mergeBookingsById(prev, monthBookings))
      setDashboardStats(statsRes)
      setLoadedMonthKeys((prev) => ({
        ...prev,
        [monthKey]: true,
      }))
      setIsBootstrapped(true)
    } catch (err) {
      console.error("Failed to refresh manager dashboard", err)
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false)
      }
    }
  }, [calendarMonthISO, todayISO, user])

  useEffect(() => {
    let active = true

    if (!user || user.role !== "manager") {
      setManagerCourts([])
      setManagerBookings([])
      setDashboardStats(null)
      setLoadedMonthKeys({})
      setIsBootstrapped(false)
      setIsRefreshing(false)
      return
    }

    const initialMonthISO = getMonthStartISO(todayISO)
    const initialMonthKey = getMonthKey(initialMonthISO)

    setCalendarMonthISO(initialMonthISO)
    setManagerCourts([])
    setManagerBookings([])
    setDashboardStats(null)
    setLoadedMonthKeys({})
    setIsBootstrapped(false)

    const loadDashboardData = async () => {
      setIsRefreshing(true)
      try {
        const [courtsRes, initialMonthBookings, statsRes] = await Promise.all([
          listCourts({ page: 1, limit: 100 }),
          fetchManagerBookingsForMonth(initialMonthISO),
          managerGetDashboardStats(),
        ])

        if (!active) return

        const managedCourts = Array.isArray(courtsRes) ? courtsRes : (courtsRes?.items || [])

        setManagerCourts(managedCourts)
        setManagerBookings(initialMonthBookings)
        setDashboardStats(statsRes)
        setLoadedMonthKeys({ [initialMonthKey]: true })
      } catch (err) {
        console.error("Failed to load manager dashboard", err)
      } finally {
        if (active) {
          setIsBootstrapped(true)
          setIsRefreshing(false)
        }
      }
    }

    loadDashboardData()

    return () => {
      active = false
    }
  }, [todayISO, user])

  const currentCalendarMonthKey = useMemo(() => getMonthKey(calendarMonthISO), [calendarMonthISO])
  const isCurrentCalendarMonthLoaded = Boolean(loadedMonthKeys[currentCalendarMonthKey])

  useEffect(() => {
    let active = true

    if (!user || user.role !== "manager" || !isBootstrapped || isCurrentCalendarMonthLoaded) {
      return
    }

    const loadMonthBookings = async () => {
      setIsRefreshing(true)
      try {
        const monthBookings = await fetchManagerBookingsForMonth(calendarMonthISO)

        if (!active) return

        setManagerBookings((prev) => mergeBookingsById(prev, monthBookings))
        setLoadedMonthKeys((prev) => ({
          ...prev,
          [currentCalendarMonthKey]: true,
        }))
      } catch (err) {
        console.error("Failed to load manager dashboard month", err)
      } finally {
        if (active) setIsRefreshing(false)
      }
    }

    loadMonthBookings()

    return () => {
      active = false
    }
  }, [calendarMonthISO, currentCalendarMonthKey, isBootstrapped, isCurrentCalendarMonthLoaded, user])

  useAutoRefresh(refreshDashboardData)

  const courtsById = useMemo(() => {
    const map: Record<string, any> = {}
    managerCourts.forEach((c) => (map[c.id] = c))
    return map
  }, [managerCourts])

  const { from, to } = useMemo(() => getRange(period), [period])
  const { from: prevFrom, to: prevTo } = useMemo(() => getPrevRange(period), [period])

  const periodBookings = useMemo(
    () => managerBookings.filter((b) => b.date && inRange(b.date, from, to)),
    [managerBookings, from, to],
  )

  const prevPeriodBookings = useMemo(
    () => managerBookings.filter((b) => b.date && inRange(b.date, prevFrom, prevTo)),
    [managerBookings, prevFrom, prevTo],
  )

  const dailyBookings = useMemo(
    () => managerBookings.filter((b) => b.date === todayISO),
    [managerBookings, todayISO],
  )


  const totalBookings = dailyBookings.length
  const completedBookings = useMemo(
    () => dailyBookings.filter((b) => b.status === "completed").length,
    [dailyBookings],
  )
  const prevBookingsCount = prevPeriodBookings.length

  const bookingGrowth = useMemo(() => {
    if (prevBookingsCount <= 0) return totalBookings > 0 ? 100 : 0
    return ((totalBookings - prevBookingsCount) / prevBookingsCount) * 100
  }, [totalBookings, prevBookingsCount])

  const cancelledList = useMemo(() => dailyBookings.filter((b) => b.status === "cancelled"), [dailyBookings])

  const todayBookings = useMemo(
    () => dailyBookings.filter((b) => b.status === "confirmed"),
    [dailyBookings],
  )

  const avgRating = useMemo(() => {
    if (!managerCourts.length) return "0.0"
    const avg = managerCourts.reduce((sum, c) => sum + (c.rating || 0), 0) / managerCourts.length
    return avg.toFixed(1)
  }, [managerCourts])

  const actualPlayedRevenue = useMemo(
    () => Number(dashboardStats?.grossRevenue || 0),
    [dashboardStats],
  )

  const checkedInRevenueCount = useMemo(
    () => Number(dashboardStats?.bookingCounts?.checked_in || 0),
    [dashboardStats],
  )

  // occupancy rate KPI removed per request

  const [selectedISO, setSelectedISO] = useState<string>(todayISO)


  if (!user || user.role !== "manager") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">{language === "ar" ? "غير مصرح" : "Unauthorized"}</p>
      </div>
    )
  }

  const isAr = language === "ar"

  // page size for agenda (requested: first 3 on mobile)
  const agendaPageSize = 3

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="space-y-4 pb-6">
<DashboardWelcomeCard
  title={isAr ? `مرحباً، ${user?.name || "مدير"}` : `Welcome, ${user?.name || "Manager"}`}
  description={
    isAr
      ? "نظرة سريعة على الحجوزات والحضور والإيرادات"
      : "A quick overview of bookings, check-ins, and revenue"
  }
  detail={
    isAr
      ? "تابع أداء الملاعب وإدارة العمليات اليومية بسهولة."
      : "Monitor court performance and manage daily operations."
  }
	/>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <KPICompactCard
          title={isAr ? "إيراد اللعب" : "Played revenue"}
          value={actualPlayedRevenue.toLocaleString(isAr ? "ar-EG" : "en-US")}
          suffix={isAr ? "ج.م" : "EGP"}
          icon={Banknote}
          tone="primary"
          sub={
            isAr
              ? `${checkedInRevenueCount.toLocaleString("ar-EG")} حجز`
              : `${checkedInRevenueCount.toLocaleString("en-US")} bookings`
          }
          loading={isRefreshing}
        />
        <KPICompactCard
          title={isAr ? "إجمالي اليوم" : "Today total"}
          value={totalBookings.toString()}
          icon={CalendarDays}
          tone="success"
          loading={isRefreshing}
        />
        <KPICompactCard
          title={isAr ? "مكتمل" : "Completed"}
          value={completedBookings.toString()}
          icon={CheckCircle2}
          tone="info"
          loading={isRefreshing}
        />
        <KPICompactCard
          title={isAr ? "مؤكد" : "Confirmed"}
          value={todayBookings.length.toString()}
          icon={Clock}
          tone="warning"
          loading={isRefreshing}
        />
      </div>

      <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-12")}>
        <div className={cn(isMobile ? "col-span-1" : "col-span-8")}>
          <ModernScheduleCalendar
            language={language}
            selectedISO={selectedISO}
            onSelectISO={setSelectedISO}
            onMonthISOChange={setCalendarMonthISO}
            bookings={managerBookings}
            courtsById={courtsById}
            now={now}
            loading={isRefreshing}
            pageSize={agendaPageSize}
          />
        </div>

        <div className={cn(isMobile ? "col-span-1" : "col-span-4")}>
          <ActionCenter
            isAr={isAr}
            todayCount={todayBookings.length}
            cancelledCount={cancelledList.length}
          />
        </div>
      </div>
    </div>
  )
}
