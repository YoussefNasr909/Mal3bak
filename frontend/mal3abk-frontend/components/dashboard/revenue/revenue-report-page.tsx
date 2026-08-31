"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import type { LucideIcon } from "lucide-react"
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  User2,
} from "lucide-react"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import {
  adminGetRevenueReport,
  listCourts,
  managerGetRevenueReport,
  type RevenueReportParams,
  type RevenueReportResponse,
} from "@/lib/api"
import type {
  Booking,
  Court,
  RevenueReportSortBy,
  RevenueReportSummary,
} from "@/lib/types"
import { addDaysToISODate, formatEgyptISODate } from "@/lib/date"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { isWalkInBooking } from "@/hooks/use-bookings-data"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type RevenuePageMode = "admin" | "manager"
type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom"

const EMPTY_SUMMARY: RevenueReportSummary = {
  totalRevenue: 0,
  checkedInCount: 0,
  completedCount: 0,
  averageBookingValue: 0,
}

const EMPTY_CUSTOMER_SUMMARY = {
  total: 0,
  guestCount: 0,
  registeredCount: 0,
  guestRevenue: 0,
  registeredRevenue: 0,
}

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 400
const AUTO_REFRESH_MS = 120_000
const MOBILE_MEDIA_QUERY = "(max-width: 767px)"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches
  })

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY)
    const handleChange = () => setIsMobile(media.matches)
    handleChange()
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [])

  return isMobile
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function isoToLocalDate(iso: string) {
  if (!iso) return undefined
  return new Date(`${iso}T12:00:00`)
}

function localDateToIso(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatPickerDateLabel(iso: string, language: "ar" | "en", placeholder: string) {
  if (!iso) return placeholder

  return new Date(`${iso}T12:00:00`).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function RevenueDateRangePickers({
  language,
  fromLabel,
  toLabel,
  pickFromPlaceholder,
  pickToPlaceholder,
  customDateFrom,
  customDateTo,
  onFromChange,
  onToChange,
}: {
  language: "ar" | "en"
  fromLabel: string
  toLabel: string
  pickFromPlaceholder: string
  pickToPlaceholder: string
  customDateFrom: string
  customDateTo: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}) {
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  const fromDate = isoToLocalDate(customDateFrom)
  const toDate = isoToLocalDate(customDateTo)

  const endOfToday = useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    return today
  }, [])

  const triggerClassName =
    "flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-start transition-colors hover:bg-muted/40"

  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/15 p-3">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {fromLabel}
        </p>
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={triggerClassName}>
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 text-sm font-medium leading-snug">
                {formatPickerDateLabel(customDateFrom, language, pickFromPlaceholder)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto rounded-2xl border border-border/60 p-0 shadow-xl"
            align="start"
          >
            {fromOpen ? (
              <CalendarPicker
                mode="single"
                selected={fromDate}
                onSelect={(date) => {
                  if (!date) return
                  const iso = localDateToIso(date)
                  onFromChange(iso)
                  if (customDateTo && iso > customDateTo) {
                    onToChange(iso)
                  }
                  setFromOpen(false)
                }}
                disabled={(date) => date > endOfToday}
                initialFocus
              />
            ) : null}
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {toLabel}
        </p>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={triggerClassName}>
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 text-sm font-medium leading-snug">
                {formatPickerDateLabel(customDateTo, language, pickToPlaceholder)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto rounded-2xl border border-border/60 p-0 shadow-xl"
            align="start"
          >
            {toOpen ? (
              <CalendarPicker
                mode="single"
                selected={toDate}
                onSelect={(date) => {
                  if (!date) return
                  onToChange(localDateToIso(date))
                  setToOpen(false)
                }}
                disabled={(date) => {
                  if (date > endOfToday) return true
                  if (fromDate) {
                    const min = new Date(fromDate)
                    min.setHours(0, 0, 0, 0)
                    const candidate = new Date(date)
                    candidate.setHours(0, 0, 0, 0)
                    return candidate < min
                  }
                  return false
                }}
                initialFocus
              />
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

function formatTime(time: string, language: "ar" | "en") {
  if (!time) return "—"

  const [hourValue, minuteValue] = time.split(":").map(Number)
  const hour = hourValue % 12 || 12
  const minutes = String(minuteValue || 0).padStart(2, "0")
  const suffix =
    hourValue >= 12
      ? language === "ar"
        ? "م"
        : "PM"
      : language === "ar"
        ? "ص"
        : "AM"

  return `${String(hour).padStart(2, "0")}:${minutes} ${suffix}`
}

function formatBookingDate(date: string, language: "ar" | "en") {
  if (!date) return "—"

  const [year, month, day] = date.split("-").map(Number)
  const dateValue = new Date(year || 1970, (month || 1) - 1, day || 1)

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateValue)
}

function formatDateTime(value: string | Date | null | undefined, language: "ar" | "en") {
  if (!value) return "—"

  const dateValue = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dateValue.getTime())) return "—"

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(dateValue)
}

function getPaymentBadgeVariant(status: Booking["paymentStatus"]) {
  if (status === "paid") return "primary" as const
  if (status === "refunded") return "destructive" as const
  return "warning" as const
}

function getBookingStatusVariant(status: Booking["status"]) {
  if (status === "completed") return "success" as const
  if (status === "cancelled" || status === "no_show") return "destructive" as const
  return "info" as const
}

const Pagination = memo(function Pagination({
  page,
  totalPages,
  onPageChange,
  rtl,
}: {
  page: number
  totalPages: number
  onPageChange: (value: number) => void
  rtl: boolean
}) {
  const pages = useMemo(() => {
    if (totalPages <= 1) return []

    const values = new Set<number>([1, totalPages, page, page - 1, page + 1])
    const sorted = Array.from(values)
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b)

    const output: Array<number | "ellipsis"> = []
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index]
      const previous = sorted[index - 1]
      if (index > 0 && current - previous > 1) output.push("ellipsis")
      output.push(current)
    }

    return output
  }, [page, totalPages])

  if (totalPages <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
      <Button
        variant="outline"
        size="sm"
        className="rounded-2xl bg-transparent"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {rtl ? (
          <ChevronRight className="me-1 h-4 w-4" />
        ) : (
          <ChevronLeft className="me-1 h-4 w-4" />
        )}
        {rtl ? "السابق" : "Prev"}
      </Button>

      <div className="flex items-center gap-1.5">
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis_${index}`} className="px-2 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={item}
              size="sm"
              variant={item === page ? "default" : "outline"}
              className={cn("min-w-9 rounded-2xl", item !== page && "bg-transparent")}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="rounded-2xl bg-transparent"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {rtl ? "التالي" : "Next"}
        {rtl ? (
          <ChevronLeft className="ms-1 h-4 w-4" />
        ) : (
          <ChevronRight className="ms-1 h-4 w-4" />
        )}
      </Button>
    </div>
  )
})

const RevenueStatCard = memo(function RevenueStatCard({
  icon: Icon,
  title,
  value,
  accent,
  isLoading = false,
  highlighted = false,
}: {
  icon: LucideIcon
  title: string
  value: string
  accent: string
  isLoading?: boolean
  highlighted?: boolean
}) {
  return (
    <Card
      className={cn(
        "border-border/60 bg-card/95 shadow-sm transition-[box-shadow,border-color] duration-300 motion-reduce:transition-none",
        highlighted && "border-primary/40 ring-2 ring-primary/25 shadow-md",
      )}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("rounded-2xl p-3 shadow-sm", accent)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-28 rounded-xl" />
          ) : (
            <p
              className={cn(
                "truncate text-3xl font-black tabular-nums tracking-tight text-foreground transition-transform duration-500",
                highlighted && "scale-[1.02] text-primary",
              )}
            >
              {value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

const RevenuePageHeader = memo(function RevenuePageHeader({
  title,
  description,
  summary,
  labels,
  currencySuffix,
  showInitialLoad,
  isRefreshing,
  highlighted = false,
}: {
  title: string
  description: string
  summary: RevenueReportSummary
  labels: {
    totalRevenue: string
    checkedInCount: string
    averageBookingValue: string
  }
  currencySuffix: string
  showInitialLoad: boolean
  isRefreshing: boolean
  highlighted?: boolean
}) {
  const busy = showInitialLoad || isRefreshing

  const stats = [
    {
      key: "revenue",
      label: labels.totalRevenue,
      main: formatMoney(summary.totalRevenue),
      suffix: currencySuffix,
      tone: "text-primary",
      tile: "border-primary/15 bg-gradient-to-b from-primary/12 to-primary/5",
    },
    {
      key: "count",
      label: labels.checkedInCount,
      main: summary.checkedInCount.toLocaleString(),
      suffix: null as string | null,
      tone: "text-emerald-600 dark:text-emerald-400",
      tile: "border-emerald-500/15 bg-gradient-to-b from-emerald-500/12 to-emerald-500/5",
    },
    {
      key: "average",
      label: labels.averageBookingValue,
      main: formatMoney(summary.averageBookingValue),
      suffix: currencySuffix,
      tone: "text-amber-600 dark:text-amber-400",
      tile: "border-amber-500/15 bg-gradient-to-b from-amber-500/12 to-amber-500/5",
    },
  ] as const

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-primary/8 via-card to-card shadow-sm transition-colors duration-300",
        highlighted && "border-primary/35 ring-2 ring-primary/15",
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block sm:text-sm">
              {description}
            </p>
          </div>
          {busy && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          )}
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className={cn(
                "min-w-0 rounded-2xl border px-1.5 py-3 text-center transition-all duration-300 sm:px-4 sm:py-5 lg:py-6",
                stat.tile,
                highlighted && !busy && "scale-[1.01] shadow-sm ring-2 ring-primary/20",
              )}
            >
              <p className="line-clamp-2 px-0.5 text-[10px] font-semibold leading-tight text-muted-foreground sm:text-sm">
                {stat.label}
              </p>
              {showInitialLoad ? (
                <Skeleton className="mx-auto mt-2 h-8 w-full max-w-[120px] rounded-lg" />
              ) : (
                <div className="mt-1.5 sm:mt-2.5 flex flex-col items-center gap-0.5 sm:gap-1">
                  <span
                    className={cn(
                      "max-w-full break-words text-lg sm:text-3xl lg:text-4xl font-black leading-none tabular-nums tracking-tight",
                      stat.tone,
                    )}
                  >
                    {stat.main}
                  </span>
                  {stat.suffix && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
                      {stat.suffix}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

const FilterPill = memo(function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
})

const RevenueBookingMobileRow = memo(function RevenueBookingMobileRow({
  booking,
  language,
  labels,
}: {
  booking: Booking
  language: "ar" | "en"
  labels: {
    notAvailable: string
    court: string
    bookingDate: string
    slotTime: string
    checkedInAt: string
    walkInGuests: string
    paid: string
    pending: string
    refunded: string
    completed: string
    confirmed: string
  }
}) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User2 className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {booking.userName || labels.notAvailable}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {booking.userPhone || labels.notAvailable}
              </p>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-lg font-black leading-tight text-foreground">
            {formatMoney(Number(booking.amount ?? booking.totalPrice ?? 0))}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            EGP
          </p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" /> {labels.court}
          </span>
          <span className="text-end font-semibold text-foreground">
            {language === "ar" ? booking.courtName : booking.courtNameEn || booking.courtName}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {labels.bookingDate}
          </span>
          <span className="text-end font-medium text-foreground">
            {formatBookingDate(booking.date, language)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 shrink-0" /> {labels.slotTime}
          </span>
          <span className="text-end font-medium text-foreground">
            {formatTime(booking.startTime, language)} – {formatTime(booking.endTime, language)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {labels.checkedInAt}
          </span>
          <span className="text-end font-medium text-foreground">
            {formatDateTime(booking.checkedInAt, language)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isWalkInBooking(booking) && (
          <Badge
            variant="outline"
            className="rounded-full border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] text-warning"
          >
            {labels.walkInGuests}
          </Badge>
        )}
        <StatusBadge variant={getPaymentBadgeVariant(booking.paymentStatus)} dot>
          {booking.paymentStatus === "paid"
            ? labels.paid
            : booking.paymentStatus === "refunded"
              ? labels.refunded
              : labels.pending}
        </StatusBadge>
        {booking.paymentStatus === "paid" && (booking.court?.paymentPolicy === "percentage" || booking.court?.paymentPolicy === "fixed") && (
          <Badge
            variant="outline"
            className="rounded-full border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-bold"
          >
            {language === "ar" ? "عربون" : "Deposit"}
          </Badge>
        )}
        {booking.latestPayment?.paymobTransactionId && (
          <Badge
            variant="secondary"
            className="rounded-full bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5"
          >
            Tx #{booking.latestPayment.paymobTransactionId}
          </Badge>
        )}
        <StatusBadge variant={getBookingStatusVariant(booking.status)} dot>
          {booking.status === "completed" ? labels.completed : labels.confirmed}
        </StatusBadge>
      </div>
    </div>
  )
})

export function RevenueReportPage({ mode }: { mode: RevenuePageMode }) {
  const { user } = useAuth()
  const { language, direction, t } = useLanguage()
  const isManager = mode === "manager"
  const isRTL = direction === "rtl"
  const isMobile = useIsMobile()
  const [, startTransition] = useTransition()

  const [searchInput, setSearchInput] = useState("")
  const [selectedCourt, setSelectedCourt] = useState("all")
  const [selectedCustomerType, setSelectedCustomerType] = useState<"all" | "guest" | "registered">("all")
  const [datePreset, setDatePreset] = useState<DatePreset>("all")
  const [customDateFrom, setCustomDateFrom] = useState("")
  const [customDateTo, setCustomDateTo] = useState("")
  const [sortBy, setSortBy] = useState<RevenueReportSortBy>("checkInAt")
  const [order, setOrder] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Booking[]>([])
  const [summary, setSummary] = useState<RevenueReportSummary>(EMPTY_SUMMARY)
  const [customerSummary, setCustomerSummary] = useState(EMPTY_CUSTOMER_SUMMARY)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [courts, setCourts] = useState<Court[]>([])
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)

  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const requestIdRef = useRef(0)
  const hasLoadedOnceRef = useRef(false)
  const courtsLoadedForRef = useRef<string | null>(null)
  const summarySignatureRef = useRef("")
  const wasLoadingRef = useRef(true)
  const [summaryHighlighted, setSummaryHighlighted] = useState(false)

  const labels = useMemo(
    () => ({
      title: t("dashboard.revenue"),
      description:
        language === "ar"
          ? isManager
            ? "تابع الإيراد الفعلي للحجوزات التي تم تسجيل حضورها في ملاعبك."
            : "تابع الإيراد الفعلي للحجوزات التي تم تسجيل حضورها عبر جميع الملاعب."
          : isManager
            ? "Track played revenue from bookings that were actually checked in across your courts."
            : "Track played revenue from bookings that were actually checked in across all courts.",
      allCourts:
        language === "ar"
          ? isManager
            ? "كل ملاعبي"
            : "كل الملاعب"
          : isManager
            ? "All my courts"
            : "All courts",
      searchPlaceholder:
        language === "ar"
          ? "ابحث باسم اللاعب أو الملعب أو رقم الهاتف"
          : "Search by player, court, or phone",
      sortLabel: language === "ar" ? "الترتيب" : "Sort",
      filtersLabel: language === "ar" ? "فلاتر التقرير" : "Report filters",
      customerTypeLabel: language === "ar" ? "نوع العميل" : "Customer type",
      allCustomers: language === "ar" ? "كل العملاء" : "All customers",
      walkInGuests: language === "ar" ? "ضيوف الحجز اليدوي" : "Walk-in guests",
      registeredUsers: language === "ar" ? "المستخدمون المسجلون" : "Registered users",
      emptyTitle: language === "ar" ? "لا يوجد إيراد مطابق" : "No matching revenue yet",
      emptyDescription:
        language === "ar"
          ? "جرّب تغيير الفترة الزمنية أو الملعب لعرض الحجوزات التي تم تسجيل حضورها."
          : "Try changing the date range or court filter to see checked-in bookings.",
      loadError:
        language === "ar"
          ? "تعذر تحميل تقرير الإيراد."
          : "Unable to load the revenue report.",
      totalRevenue:
        language === "ar" ? "إجمالي الإيراد الفعلي" : "Total played revenue",
      checkedInCount:
        language === "ar" ? "عدد الحجوزات المسجلة حضورًا" : "Checked-in bookings",
      averageBookingValue:
        language === "ar" ? "متوسط قيمة الحجز" : "Average booking value",
      guestRevenue:
        language === "ar" ? "إيراد ضيوف الحجز اليدوي" : "Walk-in revenue",
      registeredRevenue:
        language === "ar" ? "إيراد المستخدمين المسجلين" : "Registered revenue",
      bookingDate: language === "ar" ? "تاريخ الحجز" : "Booking date",
      slotTime: language === "ar" ? "الوقت" : "Slot time",
      checkedInAt:
        language === "ar" ? "وقت تسجيل الحضور" : "Checked-in at",
      amount: language === "ar" ? "القيمة" : "Amount",
      payment: language === "ar" ? "الدفع" : "Payment",
      status: language === "ar" ? "الحالة" : "Status",
      player: language === "ar" ? "اللاعب" : "Player",
      court: language === "ar" ? "الملعب" : "Court",
      allTime: language === "ar" ? "كل الوقت" : "All time",
      today: language === "ar" ? "اليوم" : "Today",
      yesterday: language === "ar" ? "أمس" : "Yesterday",
      last7Days: language === "ar" ? "7 أيام" : "7 days",
      last30Days: language === "ar" ? "30 يومًا" : "30 days",
      from: language === "ar" ? "من" : "From",
      to: language === "ar" ? "إلى" : "To",
      newestCheckIn:
        language === "ar" ? "أحدث تسجيل حضور" : "Newest check-in",
      oldestCheckIn:
        language === "ar" ? "أقدم تسجيل حضور" : "Oldest check-in",
      bookingDateNewest:
        language === "ar" ? "أحدث تاريخ حجز" : "Newest booking date",
      bookingDateOldest:
        language === "ar" ? "أقدم تاريخ حجز" : "Oldest booking date",
      highestAmount: language === "ar" ? "أعلى قيمة" : "Highest amount",
      lowestAmount: language === "ar" ? "أقل قيمة" : "Lowest amount",
      playerAZ: language === "ar" ? "اللاعب أ-ي" : "Player A-Z",
      playerZA: language === "ar" ? "اللاعب ي-أ" : "Player Z-A",
      paid: language === "ar" ? "مدفوع" : "Paid",
      pending: language === "ar" ? "معلق" : "Pending",
      refunded: language === "ar" ? "مسترد" : "Refunded",
      completed: language === "ar" ? "مكتمل" : "Completed",
      confirmed: language === "ar" ? "مؤكد" : "Confirmed",
      notAvailable: language === "ar" ? "غير متاح" : "Not available",
      loading:
        language === "ar" ? "جاري تحميل الإيراد..." : "Loading revenue...",
      resultsForFilters:
        language === "ar" ? "النتائج حسب الفلاتر" : "Results for filters",
      updating: language === "ar" ? "جاري التحديث..." : "Updating...",
      updated: language === "ar" ? "تم التحديث" : "Updated",
      bookingsList: language === "ar" ? "الحجوزات" : "Bookings",
      moreFilters: language === "ar" ? "خيارات إضافية" : "More options",
      customRange: language === "ar" ? "مخصص" : "Custom",
      resetFilters: language === "ar" ? "إعادة ضبط" : "Reset",
      allShort: language === "ar" ? "الكل" : "All",
      walkInShort: language === "ar" ? "ضيوف" : "Walk-in",
      registeredShort: language === "ar" ? "مسجل" : "Registered",
      pickFromDate: language === "ar" ? "اختر تاريخ البداية..." : "Pick start date...",
      pickToDate: language === "ar" ? "اختر تاريخ النهاية..." : "Pick end date...",
    }),
    [isManager, language, t],
  )

  const rowLabels = useMemo(
    () => ({
      notAvailable: labels.notAvailable,
      court: labels.court,
      bookingDate: labels.bookingDate,
      slotTime: labels.slotTime,
      checkedInAt: labels.checkedInAt,
      walkInGuests: labels.walkInGuests,
      paid: labels.paid,
      pending: labels.pending,
      refunded: labels.refunded,
      completed: labels.completed,
      confirmed: labels.confirmed,
    }),
    [
      labels.bookingDate,
      labels.checkedInAt,
      labels.completed,
      labels.confirmed,
      labels.court,
      labels.notAvailable,
      labels.paid,
      labels.pending,
      labels.refunded,
      labels.slotTime,
      labels.walkInGuests,
    ],
  )

  const periodPresets = useMemo(
    () =>
      [
        ["all", labels.allTime],
        ["today", labels.today],
        ["yesterday", labels.yesterday],
        ["7d", labels.last7Days],
        ["30d", labels.last30Days],
        ["custom", labels.customRange],
      ] as const,
    [
      labels.allTime,
      labels.customRange,
      labels.last30Days,
      labels.last7Days,
      labels.today,
      labels.yesterday,
    ],
  )

  const advancedFilterCount = useMemo(() => {
    let count = 0
    if (selectedCourt !== "all") count += 1
    if (sortBy !== "checkInAt" || order !== "desc") count += 1
    if (datePreset === "custom" && (customDateFrom || customDateTo)) count += 1
    return count
  }, [customDateFrom, customDateTo, datePreset, order, selectedCourt, sortBy])

  const resetFilters = useCallback(() => {
    setSearchInput("")
    setSelectedCourt("all")
    setSelectedCustomerType("all")
    setDatePreset("all")
    setCustomDateFrom("")
    setCustomDateTo("")
    setSortBy("checkInAt")
    setOrder("desc")
    setMoreFiltersOpen(false)
  }, [])

  const presetRange = useMemo(() => {
    const today = formatEgyptISODate()

    if (datePreset === "today") {
      return { dateFrom: today, dateTo: today }
    }

    if (datePreset === "yesterday") {
      const yesterday = addDaysToISODate(today, -1)
      return { dateFrom: yesterday, dateTo: yesterday }
    }

    if (datePreset === "7d") {
      return { dateFrom: addDaysToISODate(today, -6), dateTo: today }
    }

    if (datePreset === "30d") {
      return { dateFrom: addDaysToISODate(today, -29), dateTo: today }
    }

    return {
      dateFrom: datePreset === "custom" ? customDateFrom || undefined : undefined,
      dateTo: datePreset === "custom" ? customDateTo || undefined : undefined,
    }
  }, [customDateFrom, customDateTo, datePreset])

  const sortedCourts = useMemo(() => {
    return [...courts].sort((left, right) => {
      const leftName =
        language === "ar" ? left.name || "" : left.nameEn || left.name || ""
      const rightName =
        language === "ar" ? right.name || "" : right.nameEn || right.name || ""
      return leftName.localeCompare(rightName)
    })
  }, [courts, language])

  const loadCourts = useCallback(async () => {
    if (isManager && !user?.id) {
      setCourts([])
      courtsLoadedForRef.current = null
      return
    }

    const cacheKey = isManager ? user?.id || "" : "admin"
    if (courtsLoadedForRef.current === cacheKey && courts.length > 0) {
      return
    }

    const allItems: Court[] = []
    let nextPage = 1
    let totalPages = 1

    do {
      const response = await listCourts({
        page: nextPage,
        limit: 100,
        ...(isManager && user?.id ? { managerId: user.id } : {}),
      })

      allItems.push(...(response.items || []))
      totalPages = Math.max(1, Number(response.pagination?.pages || 1))
      nextPage += 1
    } while (nextPage <= totalPages)

    const uniqueCourts = Array.from(
      new Map(allItems.map((court) => [court.id, court])).values(),
    )

    setCourts(uniqueCourts)
    courtsLoadedForRef.current = cacheKey
  }, [courts.length, isManager, user?.id])

  const loadRevenueReport = useCallback(async () => {
    if (isManager && !user?.id) return

    const requestId = ++requestIdRef.current
    const isFirstLoad = !hasLoadedOnceRef.current

    if (isFirstLoad) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setLoadError(null)

    try {
      const params: RevenueReportParams = {
        page,
        limit: PAGE_SIZE,
        q: debouncedSearch || undefined,
        courtId: selectedCourt !== "all" ? selectedCourt : undefined,
        dateFrom: presetRange.dateFrom,
        dateTo: presetRange.dateTo,
        customerType: selectedCustomerType !== "all" ? selectedCustomerType : undefined,
        sortBy,
        order,
      }

      const response: RevenueReportResponse =
        mode === "manager"
          ? await managerGetRevenueReport(params)
          : await adminGetRevenueReport(params)

      if (requestId !== requestIdRef.current) return

      setItems(response.items || [])
      setSummary(response.summary || EMPTY_SUMMARY)
      setCustomerSummary(response.customerSummary || EMPTY_CUSTOMER_SUMMARY)
      setTotalItems(response.total || 0)
      setTotalPages(response.pages || 1)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setLoadError(
        error instanceof Error
          ? error.message
          : language === "ar"
            ? "تعذر تحميل تقرير الإيراد."
            : "Unable to load the revenue report.",
      )
      setCustomerSummary(EMPTY_CUSTOMER_SUMMARY)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
        hasLoadedOnceRef.current = true
      }
    }
  }, [
    debouncedSearch,
    isManager,
    language,
    mode,
    order,
    page,
    presetRange.dateFrom,
    presetRange.dateTo,
    selectedCourt,
    selectedCustomerType,
    sortBy,
    user?.id,
  ])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedCourt, selectedCustomerType, presetRange.dateFrom, presetRange.dateTo, sortBy, order])

  useEffect(() => {
    loadRevenueReport()
  }, [loadRevenueReport])

  useEffect(() => {
    loadCourts().catch(() => {
      setCourts([])
    })
  }, [loadCourts])

  useAutoRefresh(loadRevenueReport, {
    intervalMs: AUTO_REFRESH_MS,
    cooldownMs: 5_000,
  })

  const sortValue = `${sortBy}_${order}`

  const summarySignature = `${summary.totalRevenue}|${summary.checkedInCount}|${summary.averageBookingValue}`

  const activeFilterLabels = useMemo(() => {
    const parts: string[] = []

    if (datePreset === "today") parts.push(labels.today)
    else if (datePreset === "yesterday") parts.push(labels.yesterday)
    else if (datePreset === "7d") parts.push(labels.last7Days)
    else if (datePreset === "30d") parts.push(labels.last30Days)
    else if (datePreset === "custom" && (customDateFrom || customDateTo)) {
      parts.push(
        customDateFrom && customDateTo
          ? `${customDateFrom} → ${customDateTo}`
          : customDateFrom || customDateTo,
      )
    }

    if (selectedCourt !== "all") {
      const court = sortedCourts.find((item) => item.id === selectedCourt)
      if (court) {
        parts.push(language === "ar" ? court.name : court.nameEn || court.name)
      }
    }

    if (selectedCustomerType === "guest") parts.push(labels.walkInGuests)
    if (selectedCustomerType === "registered") parts.push(labels.registeredUsers)

    if (debouncedSearch.trim()) {
      parts.push(language === "ar" ? `بحث: ${debouncedSearch.trim()}` : `Search: ${debouncedSearch.trim()}`)
    }

    return parts
  }, [
    customDateFrom,
    customDateTo,
    datePreset,
    debouncedSearch,
    labels.last30Days,
    labels.last7Days,
    labels.registeredUsers,
    labels.today,
    labels.walkInGuests,
    labels.yesterday,
    language,
    selectedCourt,
    selectedCustomerType,
    sortedCourts,
  ])

  const isBusy = isLoading || isRefreshing
  const showInitialLoad = isLoading && items.length === 0

  useEffect(() => {
    const previousSignature = summarySignatureRef.current
    const finishedLoading = wasLoadingRef.current && !isBusy

    if (finishedLoading && previousSignature && previousSignature !== summarySignature) {
      setSummaryHighlighted(true)
      const timer = window.setTimeout(() => setSummaryHighlighted(false), 900)

      wasLoadingRef.current = isBusy
      summarySignatureRef.current = summarySignature
      return () => window.clearTimeout(timer)
    }

    wasLoadingRef.current = isBusy
    if (!isBusy) {
      summarySignatureRef.current = summarySignature
    }
  }, [isBusy, summarySignature])


  const headerSummaryLabels = useMemo(
    () => ({
      totalRevenue: labels.totalRevenue,
      checkedInCount: labels.checkedInCount,
      averageBookingValue: labels.averageBookingValue,
    }),
    [labels.averageBookingValue, labels.checkedInCount, labels.totalRevenue],
  )

  return (
    <div className="flex flex-col gap-4 pb-6 sm:gap-6">
      <AnimatedContainer animation="none">
        <RevenuePageHeader
          title={labels.title}
          description={labels.description}
          summary={summary}
          labels={headerSummaryLabels}
          currencySuffix={language === "ar" ? "ج.م" : "EGP"}
          showInitialLoad={showInitialLoad}
          isRefreshing={isRefreshing}
          highlighted={summaryHighlighted}
        />
      </AnimatedContainer>


      {/* ─── FILTERS + RESULTS (single card) ─── */}
      <AnimatedContainer animation="none">
        <Card className="overflow-hidden rounded-3xl border-border/60 shadow-sm">
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="relative">
              <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="h-11 rounded-2xl border-0 bg-muted/50 ps-10 shadow-none focus-visible:ring-1"
              />
            </div>

            <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {periodPresets.map(([key, label]) => (
                <FilterPill
                  key={key}
                  active={datePreset === key}
                  onClick={() => startTransition(() => setDatePreset(key as DatePreset))}
                >
                  {label}
                </FilterPill>
              ))}
            </div>

            <div className="flex gap-1.5 rounded-2xl bg-muted/50 p-1.5">
              {(
                [
                  ["all", labels.allShort, customerSummary.total] as const,
                  ["guest", labels.walkInShort, customerSummary.guestCount] as const,
                  ["registered", labels.registeredShort, customerSummary.registeredCount] as const,
                ]
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => startTransition(() => setSelectedCustomerType(key))}
                  className={cn(
                    "flex min-h-[4.25rem] flex-1 flex-col items-center justify-center rounded-xl px-1 py-2.5 transition-all sm:min-h-[4.5rem]",
                    selectedCustomerType === key
                      ? "bg-background text-foreground shadow-sm ring-1 ring-primary/20"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-[11px] font-semibold sm:text-xs">{label}</span>
                  <span
                    className={cn(
                      "mt-1 text-xl font-black tabular-nums leading-none sm:text-2xl",
                      selectedCustomerType === key ? "text-primary" : "text-foreground/80",
                    )}
                  >
                    {isLoading || isRefreshing ? "…" : count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            {datePreset === "custom" && (
              <RevenueDateRangePickers
                language={language}
                fromLabel={labels.from}
                toLabel={labels.to}
                pickFromPlaceholder={labels.pickFromDate}
                pickToPlaceholder={labels.pickToDate}
                customDateFrom={customDateFrom}
                customDateTo={customDateTo}
                onFromChange={setCustomDateFrom}
                onToChange={setCustomDateTo}
              />
            )}

            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <Select value={selectedCourt} onValueChange={setSelectedCourt}>
                <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
                  <SelectValue placeholder={labels.allCourts} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="all" className="rounded-xl">
                    {labels.allCourts}
                  </SelectItem>
                  {sortedCourts.map((court) => (
                    <SelectItem key={court.id} value={court.id} className="rounded-xl">
                      {language === "ar" ? court.name : court.nameEn || court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sortValue}
                onValueChange={(v) => {
                  const [ns, no] = v.split("_") as [RevenueReportSortBy, "asc" | "desc"]
                  setSortBy(ns)
                  setOrder(no)
                }}
              >
                <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
                  <SelectValue placeholder={labels.sortLabel} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="checkInAt_desc" className="rounded-xl">
                    {labels.newestCheckIn}
                  </SelectItem>
                  <SelectItem value="checkInAt_asc" className="rounded-xl">
                    {labels.oldestCheckIn}
                  </SelectItem>
                  <SelectItem value="date_desc" className="rounded-xl">
                    {labels.bookingDateNewest}
                  </SelectItem>
                  <SelectItem value="date_asc" className="rounded-xl">
                    {labels.bookingDateOldest}
                  </SelectItem>
                  <SelectItem value="amount_desc" className="rounded-xl">
                    {labels.highestAmount}
                  </SelectItem>
                  <SelectItem value="amount_asc" className="rounded-xl">
                    {labels.lowestAmount}
                  </SelectItem>
                  <SelectItem value="player_asc" className="rounded-xl">
                    {labels.playerAZ}
                  </SelectItem>
                  <SelectItem value="player_desc" className="rounded-xl">
                    {labels.playerZA}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Collapsible
              open={moreFiltersOpen}
              onOpenChange={setMoreFiltersOpen}
              className="md:hidden"
            >
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 justify-between rounded-xl border-0 bg-muted/50 px-3 shadow-none"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      {labels.moreFilters}
                      {advancedFilterCount > 0 && (
                        <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                          {advancedFilterCount}
                        </Badge>
                      )}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        moreFiltersOpen && "rotate-180",
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                {(advancedFilterCount > 0 ||
                  selectedCustomerType !== "all" ||
                  debouncedSearch) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-xl"
                    onClick={resetFilters}
                    aria-label={labels.resetFilters}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <CollapsibleContent className="mt-3 space-y-2 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <Select value={selectedCourt} onValueChange={setSelectedCourt}>
                  <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
                    <SelectValue placeholder={labels.allCourts} />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="all" className="rounded-xl">
                      {labels.allCourts}
                    </SelectItem>
                    {sortedCourts.map((court) => (
                      <SelectItem key={court.id} value={court.id} className="rounded-xl">
                        {language === "ar" ? court.name : court.nameEn || court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sortValue}
                  onValueChange={(v) => {
                    const [ns, no] = v.split("_") as [RevenueReportSortBy, "asc" | "desc"]
                    setSortBy(ns)
                    setOrder(no)
                  }}
                >
                  <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
                    <SelectValue placeholder={labels.sortLabel} />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="checkInAt_desc" className="rounded-xl">
                      {labels.newestCheckIn}
                    </SelectItem>
                    <SelectItem value="checkInAt_asc" className="rounded-xl">
                      {labels.oldestCheckIn}
                    </SelectItem>
                    <SelectItem value="date_desc" className="rounded-xl">
                      {labels.bookingDateNewest}
                    </SelectItem>
                    <SelectItem value="date_asc" className="rounded-xl">
                      {labels.bookingDateOldest}
                    </SelectItem>
                    <SelectItem value="amount_desc" className="rounded-xl">
                      {labels.highestAmount}
                    </SelectItem>
                    <SelectItem value="amount_asc" className="rounded-xl">
                      {labels.lowestAmount}
                    </SelectItem>
                    <SelectItem value="player_asc" className="rounded-xl">
                      {labels.playerAZ}
                    </SelectItem>
                    <SelectItem value="player_desc" className="rounded-xl">
                      {labels.playerZA}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CollapsibleContent>
            </Collapsible>

            {activeFilterLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilterLabels.map((filter) => (
                  <Badge
                    key={filter}
                    variant="secondary"
                    className="rounded-full bg-muted/80 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {filter}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>

          {/* Bookings list — same card */}
          <div className="relative border-t border-border/40">
            {isRefreshing && (
              <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-muted">
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
            )}

            <div className="border-b border-border/40 bg-muted/15 px-4 py-3 md:px-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {labels.bookingsList}
              </p>
            </div>

            {loadError ? (
              <div className="p-6">
                <EmptyState icon={CreditCard} title={labels.loadError} description={loadError} />
              </div>
            ) : showInitialLoad ? (
              <div className="flex min-h-[200px] items-center justify-center p-6">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{labels.loading}</span>
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={CreditCard}
                  title={labels.emptyTitle}
                  description={labels.emptyDescription}
                />
              </div>
            ) : isMobile ? (
              <div
                className={cn(
                  "mobile-render-list flex flex-col gap-3 bg-muted/25 p-3",
                  isRefreshing && "pointer-events-none opacity-60",
                )}
              >
                {items.map((booking) => (
                  <article
                    key={booking.id}
                    className="mobile-render-card overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
                  >
                    <RevenueBookingMobileRow
                      booking={booking}
                      language={language}
                      labels={rowLabels}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  "overflow-x-auto",
                  isRefreshing && "pointer-events-none opacity-60",
                )}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.player}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.court}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.bookingDate}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.slotTime}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.checkedInAt}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.amount}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.payment}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">
                        {labels.status}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((booking) => (
                      <TableRow
                        key={booking.id}
                        className="border-border/30 transition-colors hover:bg-muted/30"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <User2 className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {booking.userName || labels.notAvailable}
                                </span>
                                {isWalkInBooking(booking) && (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-warning/30 bg-warning/10 px-1.5 py-0 text-[10px] text-warning"
                                  >
                                    {labels.walkInGuests}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {booking.userPhone || labels.notAvailable}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {language === "ar"
                                ? booking.courtName
                                : booking.courtNameEn || booking.courtName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {language === "ar"
                                ? booking.courtCity || ""
                                : booking.courtCityEn || booking.courtCity || ""}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatBookingDate(booking.date, language)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatTime(booking.startTime, language)} –{" "}
                          {formatTime(booking.endTime, language)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDateTime(booking.checkedInAt, language)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-black text-foreground">
                            {formatMoney(Number(booking.amount ?? booking.totalPrice ?? 0))}{" "}
                            <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
                              EGP
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <StatusBadge variant={getPaymentBadgeVariant(booking.paymentStatus)} dot>
                                {booking.paymentStatus === "paid"
                                  ? labels.paid
                                  : booking.paymentStatus === "refunded"
                                    ? labels.refunded
                                    : labels.pending}
                              </StatusBadge>
                              {booking.paymentStatus === "paid" && (booking.court?.paymentPolicy === "percentage" || booking.court?.paymentPolicy === "fixed") && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400 font-bold"
                                >
                                  {language === "ar" ? "عربون" : "Deposit"}
                                </Badge>
                              )}
                            </div>
                            {booking.latestPayment?.paymobTransactionId && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                Tx #{booking.latestPayment.paymobTransactionId}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={getBookingStatusVariant(booking.status)} dot>
                            {booking.status === "completed" ? labels.completed : labels.confirmed}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {!loadError && (items.length > 0 || (isBusy && page > 1)) && (
              <div className="border-t border-border/40 p-4 md:px-6">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  rtl={isRTL}
                />
              </div>
            )}
          </div>
        </Card>
      </AnimatedContainer>
    </div>
  )
}
