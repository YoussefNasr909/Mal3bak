"use client"

import * as React from "react"
import { useMemo, useEffect, useCallback, useState } from "react"
import {
  Search,
  Download,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  CalendarDays,
  ArrowUpDown,
  RefreshCcw,
  Copy,
  Phone,
  Mail,
  Filter,
  Check,
  X,
  Eye,
  ShieldAlert,
  Building2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
} from "lucide-react"
import {
  format,
} from "date-fns"
import { ar, enUS } from "date-fns/locale"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import { isWalkInBooking, normalizeBookingStatus } from "@/hooks/use-bookings-data"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { createEgyptDate, getAbsoluteBookingTimes, getEgyptTodayString, addDaysToISODate, formatEgyptISODate } from "@/lib/date"
import {
  listBookings as listBookingsApi,
  listCourts as listCourtsApi,
  updateBooking as updateBookingApi,
  cancelBooking as cancelBookingApi,
  checkInBooking as checkInBookingApi,
  deleteBooking as deleteBookingApi,
  type ListBookingsParams,
  type ListBookingsResponse,
} from "@/lib/api"

import { EmptyState } from "@/components/ui/empty-state"
import { BookingFilters } from "@/components/dashboard/manager/bookings/booking-filters"
import { BookingStatsCards } from "@/components/dashboard/manager/bookings/booking-stats-cards"
import { StatusBadge } from "@/components/ui/status-badge"

import { Suspense, lazy } from "react"
const AdminBookingDetailsDialog = lazy(() => import("@/components/dashboard/admin/admin-booking-details-dialog").then(m => ({ default: m.AdminBookingDetailsDialog })))

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"

/** ----------------------------------------
 * Premium Admin Bookings Page
 * - ONE core bookings table (responsive cards on mobile)
 * - Full details drawer (dialog) for each booking
 * - Clean filters, sorting, export, bulk selection
 * - No charts
 * ---------------------------------------- */

type BookingRow = Record<string, any>
type CourtRow = Record<string, any>
type BookingStatusAction = "confirm" | "complete" | "cancel" | "no_show"
type BookingActionTarget =
  | { scope: "single"; id: string; action: BookingStatusAction }
  | { scope: "bulk"; ids: string[]; action: BookingStatusAction }

type StatusKey = "all" | "checked_in" | "confirmed" | "cancelled" | "no_show"
type CustomerTypeKey = "all" | "guest" | "registered"
type DatePresetKey = "all" | "today" | "tomorrow" | "this_week" | "this_month" | "past"
type SortKey = "date" | "amount" | "status"
type SortState = { key: SortKey; dir: "asc" | "desc" }

function parseEgyptDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return createEgyptDate(y || 1970, m || 1, d || 1, 12, 0)
}

function getEgyptTodayDay() {
  return parseEgyptDay(formatEgyptISODate(new Date()))
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const m = window.matchMedia(query)
    const onChange = () => setMatches(m.matches)
    onChange()
    if (m.addEventListener) m.addEventListener("change", onChange)
    else m.addListener(onChange)
    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange)
      else m.removeListener(onChange)
    }
  }, [query])

  return matches
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])

  return debounced
}

function csvEscape(value: unknown) {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "0"
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
  } catch {
    return String(Math.round(n))
  }
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function format12h(time: string, lang: string) {
  if (!time) return "";
  const [hh, mm] = time.split(":").map(Number);
  const ampm = hh >= 12 ? (lang === "ar" ? "م" : "PM") : (lang === "ar" ? "ص" : "AM");
  const h12 = hh % 12 || 12;
  return `\u200E${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function checkNextDay(time: string, openTime?: string, closeTime?: string) {
  if (!time || !openTime || !closeTime) return false;
  const toMin = (t: string) => {
    const [hh, mm] = t.split(":").map(Number);
    return hh * 60 + mm;
  };
  const tM = toMin(time);
  const oM = toMin(openTime);
  const cM = toMin(closeTime);
  if (cM < oM || cM === oM) return tM < oM;
  return false;
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  rtl,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  rtl?: boolean;
}) {
  const go = (p: number) => onPageChange(clamp(p, 1, totalPages));

  // Hook is now called safely BEFORE any early returns
  const pages = useMemo(() => {
    if (totalPages <= 1) return [];

    const set = new Set<number>();
    set.add(1);
    set.add(totalPages);
    set.add(page);
    set.add(page - 1);
    set.add(page + 1);
    const arr = Array.from(set)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);

    const out: (number | "ellipsis")[] = [];
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      const prev = arr[i - 1];
      if (i > 0 && cur - prev > 1) out.push("ellipsis");
      out.push(cur);
    }
    return out;
  }, [page, totalPages]);

  // Safe early return goes AFTER all hooks
  if (totalPages <= 1) return null;

  const labelPrev = rtl ? "السابق" : "Prev";
  const labelNext = rtl ? "التالي" : "Next";

  return (
    <div className={cn("flex items-center justify-center gap-2 w-full pt-4", rtl && "flex-row-reverse")}>
      <Button variant="outline" size="sm" className="rounded-2xl bg-transparent" onClick={() => go(page - 1)} disabled={page <= 1}>
        {rtl ? <ChevronRight className="h-4 w-4 ms-1" /> : <ChevronLeft className="h-4 w-4 me-1" />}
        {labelPrev}
      </Button>

      <div className="hidden sm:flex items-center gap-1.5">
        {pages.map((p, idx) =>
          p === "ellipsis" ? (
            <span key={`dots_${idx}`} className="px-2 text-muted-foreground">...</span>
          ) : (
            <Button key={p} size="sm" variant={p === page ? "default" : "outline"} className={cn("rounded-2xl min-w-9", p !== page && "bg-transparent")} onClick={() => go(p as number)}>
              {p}
            </Button>
          )
        )}
      </div>

      <div className="sm:hidden text-sm font-medium px-3 text-muted-foreground">
        {page} / {totalPages}
      </div>

      <Button variant="outline" size="sm" className="rounded-2xl bg-transparent" onClick={() => go(page + 1)} disabled={page >= totalPages}>
        {labelNext}
        {rtl ? <ChevronLeft className="h-4 w-4 ms-1" /> : <ChevronRight className="h-4 w-4 ms-1" />}
      </Button>
    </div>
  );
}
function bookingDateTime(b: BookingRow, court?: CourtRow) {
  if (!b?.date) return new Date()
  const c = court || b.court
  const openTime = b.sessionOpenTime || c?.openTime || "08:00"
  const useOpeningDay = b.useOpeningDayForOvernightBookings === true
  
  const { startMs } = getAbsoluteBookingTimes(b.date, b.startTime || "00:00", b.endTime || "23:59", openTime, useOpeningDay)
  return new Date(startMs)
}

function statusTone(status: string) {
  const s = String(status || "").toLowerCase()
  if (s === "checked_in" || s === "confirmed") return "success"
  if (s === "completed") return "success"
  if (s === "pending_payment" || s === "pending") return "warning"
  if (s === "cancelled" || s === "no_show") return "destructive"
  return "secondary"
}



function hasAttendanceRecord(booking: Partial<BookingRow> | Record<string, unknown>) {
  return Boolean(
    booking?.status === "completed" ||
      booking?.checkInVerified === true ||
      booking?.checkedIn === true ||
      booking?.checkedInAt,
  )
}

export function AdminBookingsPage() {
  const { language } = useLanguage()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const rtl = language === "ar"

  const locale = rtl ? ar : enUS
  const [bookingsResult, setBookingsResult] = useState<ListBookingsResponse>({
    items: [],
    total: 0,
    page: 1,
    limit: 10,
    pages: 1,
  })
  const [courtsState, setCourtsState] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)

  const fetchAllCourts = useCallback(async () => {
    try {
      const perPage = 100
      const courtsRes = await listCourtsApi({ page: 1, limit: perPage })
      let allCourts = [...(courtsRes.items || [])]

      // Helper to fetch in chunks
      const fetchInChunks = async (fetcher: any, totalPages: number, chunkSize = 3) => {
        let results: any[] = []
        for (let i = 2; i <= totalPages; i += chunkSize) {
          const chunk = []
          for (let j = 0; j < chunkSize && i + j <= totalPages; j++) {
            chunk.push(fetcher({ page: i + j, limit: perPage }))
          }
          const chunkResults = await Promise.all(chunk)
          chunkResults.forEach((res) => {
            results = results.concat(res.items || [])
          })
        }
        return results
      }

      const cPages = (courtsRes as any).pagination?.pages || (courtsRes as any).pages || 1

      const cResults = await fetchInChunks(listCourtsApi, cPages)

      allCourts = allCourts.concat(cResults)

      return allCourts
    } catch (error) {
      console.error(error)
      toast.error(rtl ? "تعذر تحميل الحجوزات" : "Failed to load bookings")
    }
  }, [rtl])

  const courtsById = useMemo(() => {
    const m = new Map<string, CourtRow>()
    for (const c of courtsState as any[]) m.set(c.id, c)
    return m
  }, [courtsState])

  // -------- UI state --------
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300)
  const [selectedStatus, setSelectedStatus] = useState<StatusKey>("all")
  const [selectedCustomerType, setSelectedCustomerType] = useState<CustomerTypeKey>("all")
  const [selectedCourt, setSelectedCourt] = useState<string>("all")
  const [selectedDateRange, setSelectedDateRange] = useState<DatePresetKey>("all")
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "desc" })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null)
  const [bookingActionTarget, setBookingActionTarget] = useState<BookingActionTarget | null>(null)
  const [isApplyingBookingAction, setIsApplyingBookingAction] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: "single", id: string } | { type: "bulk" } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedStatus, selectedCustomerType, selectedCourt, selectedDateRange, sort.key, sort.dir])

  const bookingQuery = useMemo<ListBookingsParams>(() => {
    const params: ListBookingsParams = {
      page,
      limit: pageSize,
      includeSummary: true,
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(selectedCourt !== "all" ? { courtId: selectedCourt } : {}),
      sortBy: sort.key,
      order: sort.dir,
    }

    if (selectedStatus === "checked_in") {
      ;(params as any).attendance = "checked_in"
    } else if (selectedStatus !== "all") {
      params.status = selectedStatus
    }

    if (selectedCustomerType !== "all") {
      params.customerType = selectedCustomerType
    }

    if (selectedDateRange !== "all") {
      const todayISO = getEgyptTodayString()
      if (selectedDateRange === "today") {
        params.date = todayISO
      } else if (selectedDateRange === "tomorrow") {
        params.date = addDaysToISODate(todayISO, 1)
      } else if (selectedDateRange === "this_week") {
        params.dateFrom = todayISO
        params.dateTo = addDaysToISODate(todayISO, 7)
      } else if (selectedDateRange === "this_month") {
        params.dateFrom = todayISO
        params.dateTo = addDaysToISODate(todayISO, 30)
      } else if (selectedDateRange === "past") {
        ;(params as any).bucket = "past"
      }
    }

    return params
  }, [page, pageSize, debouncedSearch, selectedStatus, selectedCustomerType, selectedCourt, selectedDateRange, sort.key, sort.dir])

  const loadCourts = useCallback(async () => {
    try {
      const allCourts = await fetchAllCourts()
      setCourtsState(allCourts ?? [])
    } catch (error) {
      console.error(error)
      setCourtsState([])
      toast.error(rtl ? "تعذر تحميل الملاعب" : "Failed to load courts")
    }
  }, [fetchAllCourts, rtl])

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true)

    try {
      const res = await listBookingsApi(bookingQuery)
      setBookingsResult(res)
    } catch (error) {
      console.error(error)
      setBookingsResult({
        items: [],
        total: 0,
        page,
        limit: pageSize,
        pages: 1,
      })
      toast.error(rtl ? "تعذر تحميل الحجوزات" : "Failed to load bookings")
    } finally {
      setBookingsLoading(false)
    }
  }, [bookingQuery, page, pageSize, rtl])

  const loadData = useCallback(async () => {
    await Promise.all([loadCourts(), loadBookings()])
  }, [loadCourts, loadBookings])

  useEffect(() => {
    loadCourts()
  }, [loadCourts])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useAutoRefresh(loadData, { intervalMs: 60_000 })

  const getStatusLabel = useCallback(
    (status: string) => {
      const labels: Record<string, { ar: string; en: string }> = {
        checked_in: { ar: "تم تسجيل الحضور", en: "Checked In" },
        pending: { ar: "مؤكد", en: "Confirmed" },
        confirmed: { ar: "مؤكد", en: "Confirmed" },
        cancelled: { ar: "ملغي", en: "Cancelled" },
        completed: { ar: "مكتمل", en: "Completed" },
        no_show: { ar: "لم يحضر", en: "Missed booking" },
      }
      const key = normalizeBookingStatus(status)
      const v = labels[key]
      if (!v) return rtl ? "غير معروف" : "Unknown"
      return rtl ? v.ar : v.en
    },
    [rtl]
  )

  const getPaymentLabel = useCallback(
    (paymentStatus: string) => {
      const s = String(paymentStatus || "pending").toLowerCase()
      if (s === "pending" || s === "pending_payment") return rtl ? "غير مدفوع" : "Unpaid"
      if (s === "paid" || s === "completed") return rtl ? "مدفوع" : "Paid"
      if (s === "refunded") return rtl ? "مسترد" : "Refunded"
      if (s === "failed") return rtl ? "فشل" : "Failed"
      return rtl ? "غير معروف" : "Unknown"
    },
    [rtl]
  )

  const getPlayerInfo = useCallback(
    (b: BookingRow) => {
      const name = rtl
        ? b.playerName || b.userName || "—"
        : b.playerNameEn || b.userName || b.playerName || "—"

      return {
        id: b.playerId || b.userId || "",
        name,
        phone: b.userPhone || "—",
        email: b.userEmail || "—",
        avatar: b.userAvatar || "/placeholder-user.jpg",
      }
    },
    [rtl]
  )

  const getCourtInfo = useCallback(
    (b: BookingRow) => {
      const c = courtsById.get(b.courtId)
      const name = rtl ? b.courtName || c?.name || "—" : b.courtNameEn || c?.nameEn || b.courtName || "—"
      const city = rtl ? b.courtCity || c?.city || "—" : b.courtCityEn || b.courtCity || c?.cityEn || c?.city || "—"
      const address = rtl ? b.courtAddress || c?.address || "—" : b.courtAddressEn || b.courtAddress || c?.addressEn || c?.address || "—"
      const sportType = c?.sportType || b.sportType || ""
      return { name, city, address, sportType, court: c }
    },
    [rtl, courtsById]
  )

  const filtered = useMemo(() => (bookingsResult.items || []) as BookingRow[], [bookingsResult.items])
  const customerCounts = useMemo(
    () => ({
      total: Number(bookingsResult.customerSummary?.total || 0),
      guest: Number(bookingsResult.customerSummary?.guest || 0),
      registered: Number(bookingsResult.customerSummary?.registered || 0),
    }),
    [bookingsResult.customerSummary],
  )
  const statusCounts = useMemo(() => {
    const summary = bookingsResult.summary
    if (!summary) {
      return { confirmed: 0, checked_in: 0, cancelled: 0, no_show: 0 }
    }
    return {
      confirmed: Number(summary.confirmed || 0),
      checked_in: Number(summary.checked_in || 0),
      cancelled: Number(summary.cancelled || 0),
      no_show: Number(summary.no_show || 0),
    }
  }, [bookingsResult.summary])
  const totalPages = Math.max(1, bookingsResult.pages || 1)
  const totalResults = bookingsResult.total || 0
  const adminStats = useMemo(
    () => ({
      total: Number(bookingsResult.summary?.total || totalResults || 0),
      checkedIn: Number(bookingsResult.summary?.checked_in || 0),
      todayBookings: customerCounts.total,
      noShow: Number(bookingsResult.summary?.no_show || 0),
    }),
    [bookingsResult.summary, totalResults, customerCounts.total],
  )
  const filterSortBy = useMemo(() => {
    if (sort.key === "amount") return sort.dir === "desc" ? "price_desc" : "price_asc"
    return sort.dir === "desc" ? "date_desc" : "date_asc"
  }, [sort])
  const pageItems = filtered

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages])

  const selectedCount = selectedIds.size
  const allVisibleSelected = useMemo(() => pageItems.length > 0 && pageItems.every((b) => selectedIds.has(String(b.id))), [pageItems, selectedIds])

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const b of pageItems) {
        const id = String(b.id)
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const openDetails = (b: BookingRow) => {
    setActiveBooking(b)
    setDetailsOpen(true)
  }

  const exportCsv = async (onlySelected: boolean) => {
    let rows: BookingRow[] = onlySelected
      ? filtered.filter((b) => selectedIds.has(String(b.id)))
      : []

    if (!onlySelected) {
      let nextPage = 1
      let totalPagesForExport = 1

      do {
        const res = await listBookingsApi({
          ...bookingQuery,
          page: nextPage,
          limit: 200,
        })

        rows = rows.concat((res.items || []) as BookingRow[])
        totalPagesForExport = res.pages || 1
        nextPage += 1
      } while (nextPage <= totalPagesForExport)
    }

    if (rows.length === 0) {
      toast.error(rtl ? "لا توجد حجوزات للتصدير" : "No bookings to export")
      return
    }

    const header = [
      "id",
      "date",
      "startTime",
      "endTime",
      "status",
      "payment",
      "amount",
      "court",
      "city",
      "player",
      "phone",
      "email",
    ]

    const lines = rows.map((b) => {
      const courtInfo = getCourtInfo(b)
      const d = bookingDateTime(b, courtInfo.court)
      const player = getPlayerInfo(b)
      const amount = Number(b.totalPrice ?? b.amount ?? 0)

      return [
        b.id,
        format(d, "yyyy-MM-dd", { locale }),
        b.startTime || "",
        b.endTime || "",
        String(b.status || ""),
        getPaymentLabel(String(b.paymentStatus || "pending")),
        amount,
        courtInfo.name,
        courtInfo.city,
        player.name,
        player.phone,
        player.email,
      ].map(csvEscape)
    })

    const csv = [header.map(csvEscape).join(","), ...lines.map((l) => l.join(","))].join("\n")
    downloadBlob(`bookings_${new Date().toISOString().slice(0, 10)}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }))
    toast.success(rtl ? "تم تصدير الملف" : "Exported")
  }

  const copyText = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt)
      toast.success(rtl ? "تم النسخ" : "Copied")
    } catch {
      toast.error(rtl ? "فشل النسخ" : "Copy failed")
    }
  }

  const getBookingActionDialogCopy = useCallback(
    (action: BookingStatusAction, count = 1) => {
      const countLabel = count > 1 ? `${count} ${rtl ? "حجوزات" : "bookings"}` : rtl ? "هذا الحجز" : "this booking"
      if (action === "confirm") {
        return {
          title: rtl ? "تأكيد الحجز" : "Confirm booking",
          description: rtl
            ? `سيتم تأكيد ${countLabel} ومتابعته كحجز مؤكد.`
            : `This will confirm ${countLabel} and keep it active as a confirmed booking.`,
          confirmLabel: rtl ? "تأكيد" : "Confirm",
          confirmVariant: "default" as const,
        }
      }
      if (action === "complete") {
        return {
          title: rtl ? "تسجيل حضور الحجز" : "Check in booking",
          description: rtl
            ? `سيتم تسجيل حضور ${countLabel} وتحديثه كحجز تم حضوره.`
            : `This will check in ${countLabel} and mark attendance as completed.`,
          confirmLabel: rtl ? "تسجيل الحضور" : "Check in",
          confirmVariant: "default" as const,
        }
      }
      if (action === "cancel") {
        return {
          title: rtl ? "إلغاء الحجز" : "Cancel booking",
          description: rtl
            ? `سيتم إلغاء ${countLabel}.`
            : `This will cancel ${countLabel}.`,
          confirmLabel: rtl ? "إلغاء الحجز" : "Cancel booking",
          confirmVariant: "destructive" as const,
        }
      }
      return {
        title: rtl ? "تسجيل كعدم حضور" : "Mark as missed",
        description: rtl
          ? `سيتم تسجيل ${countLabel} كعدم حضور.`
          : `This will mark ${countLabel} as a missed booking.`,
        confirmLabel: rtl ? "تسجيل كعدم حضور" : "Mark as missed",
        confirmVariant: "destructive" as const,
      }
    },
    [rtl],
  )

  const runBookingAction = useCallback(
    async (id: string, action: "confirm" | "complete" | "cancel" | "no_show") => {
      if (action === "cancel") return cancelBookingApi(id, { lang: language })
      if (action === "confirm") return updateBookingApi(id, { status: "confirmed" })
      if (action === "complete") return checkInBookingApi(id)
      return updateBookingApi(id, { status: "no_show" })
    },
    [language],
  )

  const singleActionSuccessMessage = useCallback(
    (action: BookingStatusAction) => {
      if (action === "confirm") return rtl ? "تم التأكيد" : "Confirmed"
      if (action === "complete") return rtl ? "تم تسجيل الحضور" : "Checked in"
      if (action === "cancel") return rtl ? "تم الإلغاء" : "Cancelled"
      return rtl ? "تم التحديث" : "Updated"
    },
    [rtl],
  )

  const requestSingleBookingAction = useCallback((id: string, action: BookingStatusAction) => {
    setBookingActionTarget({ scope: "single", id, action })
  }, [])

  const requestBulkBookingAction = useCallback(
    (action: BookingStatusAction) => {
      if (selectedIds.size === 0) {
        toast.error(rtl ? "اختر حجوزات أولاً" : "Select bookings first")
        return
      }
      setBookingActionTarget({ scope: "bulk", ids: Array.from(selectedIds), action })
    },
    [rtl, selectedIds],
  )

  const applyPendingBookingAction = useCallback(async () => {
    if (!bookingActionTarget) return

    setIsApplyingBookingAction(true)

    try {
      if (bookingActionTarget.scope === "single") {
        await runBookingAction(bookingActionTarget.id, bookingActionTarget.action)
        toast.success(singleActionSuccessMessage(bookingActionTarget.action))
      } else {
        const results = await Promise.allSettled(
          bookingActionTarget.ids.map((id) => runBookingAction(id, bookingActionTarget.action)),
        )
        const hasErrors = results.some((result) => result.status === "rejected")

        if (hasErrors) {
          toast.error(rtl ? "حدث خطأ في بعض العمليات" : "Some actions failed")
        } else {
          toast.success(rtl ? "تم تطبيق الإجراء" : "Action applied successfully")
        }

        setSelectedIds(new Set())
      }

      setBookingActionTarget(null)
      await loadBookings()
    } catch (error: any) {
      toast.error(error?.message || (rtl ? "حدث خطأ" : "An error occurred"))
    } finally {
      setIsApplyingBookingAction(false)
    }
  }, [bookingActionTarget, loadBookings, rtl, runBookingAction, singleActionSuccessMessage])

  const courtsForFilter = useMemo(() => {
    const list = (courtsState || []) as CourtRow[]
    const collator = new Intl.Collator(rtl ? "ar-EG" : "en-US", { sensitivity: "base" })
    return [...list].sort((a, b) => {
      const an = rtl ? (a.name || "") : (a.nameEn || a.name || "")
      const bn = rtl ? (b.name || "") : (b.nameEn || b.name || "")
      return collator.compare(an, bn)
    })
  }, [rtl, courtsState]) // <--- ADDED courtsState

  const renderTableHeaderCell = ({
    label,
    sortKey,
    className,
  }: {
    label: string
    sortKey?: SortKey
    className?: string
  }) => {
    const isActive = sortKey && sort.key === sortKey
    return (
      <TableHead className={cn("text-xs font-semibold text-muted-foreground", className)}>
        {sortKey ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 hover:text-foreground transition"
            onClick={() => {
              setSort((prev) => {
                if (prev.key !== sortKey) return { key: sortKey, dir: "desc" }
                return { key: sortKey, dir: prev.dir === "desc" ? "asc" : "desc" }
              })
            }}
          >
            {label}
            <ArrowUpDown className={cn("h-4 w-4", isActive ? "text-foreground" : "text-muted-foreground")} />
          </button>
        ) : (
          <span>{label}</span>
        )}
      </TableHead>
    )
  }

  const detailsBooking = activeBooking
    ? (pageItems.find((x) => x.id === activeBooking.id) || activeBooking)
    : null

  const renderMobileCards = () => (
    <div className="mobile-render-list space-y-3">
      {pageItems.map((b) => {
        const id = String(b.id)
        const selected = selectedIds.has(id)
        const d = bookingDateTime(b)
        const player = getPlayerInfo(b)
        const court = getCourtInfo(b)
        const amount = Number(b.totalPrice ?? b.amount ?? 0)
        const status = String(b.status || "").toLowerCase()

        return (
          <div
            key={id}
            className={cn(
              "mobile-render-card rounded-3xl border border-border/50 bg-card/95 p-4 cursor-pointer transition-colors hover:border-primary/40 dark:bg-card",
              selected ? "ring-2 ring-primary/25" : ""
            )}
            onClick={() => openDetails(b)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onCheckedChange={(v) => toggleSelectOne(id, Boolean(v))} />
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {format(d, "PPP", { locale })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format12h(b.startTime, language)} - {format12h(b.endTime, language)} • {court.name}
                    {/* Removed Next Day label */}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <StatusBadge variant={statusTone(status) as any} dot>
                  {getStatusLabel(status)}
                </StatusBadge>
                <Badge variant="outline" className="rounded-2xl">
                  {getPaymentLabel(String(b.paymentStatus || "pending"))}
                </Badge>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-9 w-9 rounded-2xl">
                    <AvatarImage src={player.avatar} />
                    <AvatarFallback>{String(player.name || "U").slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{player.name}</p>
                    {isWalkInBooking(b) ? (
                      <Badge variant="outline" className="mt-1 rounded-2xl border-warning/30 bg-warning/10 text-warning">
                        {rtl ? "ضيف حجز يدوي" : "Walk-in guest"}
                      </Badge>
                    ) : null}
                    <p className="text-xs text-muted-foreground truncate">{player.phone}</p>
                  </div>
                </div>
                <p className="text-sm font-extrabold">
                  {formatMoney(amount)} {rtl ? "جنيه" : "EGP"}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {rtl ? "المدينة:" : "City:"} {court.city}
                </p>
                <Button
                  variant="outline"
                  className="rounded-2xl bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDetails(b)
                  }}
                >
                  <Eye className="me-2 h-4 w-4" />
                  {rtl ? "عرض" : "View"}
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderDesktopTable = () => (
    <div className="rounded-3xl border border-border/50 bg-background/70 overflow-x-auto">
      <Table className="min-w-[900px]">
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[48px]">
              <Checkbox checked={allVisibleSelected} onCheckedChange={(v) => toggleSelectAllVisible(Boolean(v))} />
            </TableHead>
            {renderTableHeaderCell({ label: rtl ? "الحجز" : "Booking" })}
            {renderTableHeaderCell({ label: rtl ? "التاريخ" : "Date", sortKey: "date" })}
            {renderTableHeaderCell({ label: rtl ? "اللاعب" : "Player" })}
            {renderTableHeaderCell({ label: rtl ? "الملعب" : "Court" })}
            {renderTableHeaderCell({ label: rtl ? "المبلغ" : "Amount", sortKey: "amount", className: "text-right" })}
            {renderTableHeaderCell({ label: rtl ? "الحالة" : "Status", sortKey: "status" })}
            {renderTableHeaderCell({ label: rtl ? "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062d\u0636\u0648\u0631" : "Checked in" })}
            <TableHead className="w-[64px]" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {pageItems.map((b) => {
            const id = String(b.id)
            const selected = selectedIds.has(id)
            const court = getCourtInfo(b)
            const d = bookingDateTime(b, court.court)
            const player = getPlayerInfo(b)
            const amount = Number(b.totalPrice ?? b.amount ?? 0)
            const status = String(b.status || "").toLowerCase()
            const checkedIn = hasAttendanceRecord(b)

            return (
              <TableRow
                key={id}
                className={cn("hover:bg-muted/30 transition cursor-pointer", selected ? "bg-primary/5" : "")}
                onClick={() => openDetails(b)}
              >
                {/* 1. Stop propagation on the checkbox cell */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected} onCheckedChange={(v) => toggleSelectOne(id, Boolean(v))} />
                </TableCell>

                <TableCell className="align-top">
                  <div className="space-y-1">
                    <p className="font-semibold leading-tight">#{String(id).slice(0, 8)}</p>
                    {/* 2. Stop propagation on the copy button */}
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyText(String(id))
                      }}
                    >
                      {rtl ? "نسخ المعرف" : "Copy ID"}
                    </button>
                  </div>
                </TableCell>

                <TableCell className="align-top">
                  <div className="space-y-1">
                    <p className="font-semibold">{format(d, "PP", { locale })}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="inline h-3.5 w-3.5" />
                      {format12h(b.startTime, language)} - {format12h(b.endTime, language)}
                      {/* Removed Next Day label */}
                    </p>
                  </div>
                </TableCell>

                <TableCell className="align-top">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 rounded-2xl">
                      <AvatarImage src={player.avatar} />
                      <AvatarFallback>{String(player.name || "U").slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{player.name}</p>
                      {isWalkInBooking(b) ? (
                        <Badge variant="outline" className="mt-1 rounded-2xl border-warning/30 bg-warning/10 text-warning">
                          {rtl ? "ضيف حجز يدوي" : "Walk-in guest"}
                        </Badge>
                      ) : null}
                      <p className="text-xs text-muted-foreground truncate">
                        <Phone className="inline h-3.5 w-3.5 me-1" />
                        {player.phone}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="align-top">
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold truncate">{court.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <MapPin className="inline h-3.5 w-3.5 me-1" />
                      {court.city}
                    </p>
                  </div>
                </TableCell>

                <TableCell className="align-top text-right">
                  <p className="font-extrabold">
                    {formatMoney(amount)} {rtl ? "جنيه" : "EGP"}
                  </p>
                </TableCell>

                <TableCell className="align-top">
                  <StatusBadge variant={statusTone(status) as any} dot>
                    {getStatusLabel(status)}
                  </StatusBadge>
                </TableCell>

                <TableCell className="align-top">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-2xl",
                      checkedIn
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {checkedIn
                      ? (rtl ? "\u062a\u0645 \u0627\u0644\u062d\u0636\u0648\u0631" : "Checked in")
                      : (rtl ? "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u062d\u0636\u0648\u0631" : "Not checked in")}
                  </Badge>
                </TableCell>

                <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline" className="rounded-2xl bg-transparent">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-2xl">
                      <DropdownMenuLabel>{rtl ? "إجراءات" : "Actions"}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openDetails(b)}>
                        <Eye className="me-2 h-4 w-4" />
                        {rtl ? "عرض التفاصيل" : "View details"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyText(String(b.id))}>
                        <Copy className="me-2 h-4 w-4" />
                        {rtl ? "نسخ المعرف" : "Copy ID"}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{rtl ? "تغيير الحالة" : "Update status"}</DropdownMenuLabel>
                      {status !== "confirmed" && status !== "completed" && status !== "cancelled" && (
                        <DropdownMenuItem
                          onClick={() => requestSingleBookingAction(String(b.id), "confirm")}
                        >
                          <CheckCircle2 className="me-2 h-4 w-4 text-primary" />
                          {rtl ? "تأكيد" : "Confirm"}
                        </DropdownMenuItem>
                      )}
                      {status !== "completed" && status !== "cancelled" && (
                        <DropdownMenuItem
                          onClick={() => requestSingleBookingAction(String(b.id), "complete")}
                        >
                          <Check className="me-2 h-4 w-4 text-success" />
                          {rtl ? "تسجيل الحضور" : "Check in"}
                        </DropdownMenuItem>
                      )}
                      {status !== "cancelled" && (
                        <DropdownMenuItem
                          onClick={() => requestSingleBookingAction(String(b.id), "cancel")}
                        >
                          <XCircle className="me-2 h-4 w-4 text-destructive" />
                          {rtl ? "إلغاء" : "Cancel"}
                        </DropdownMenuItem>
                      )}
                      {status !== "cancelled" && status !== "completed" && status !== "no_show" && (
                        <DropdownMenuItem
                          onClick={() => requestSingleBookingAction(String(b.id), "no_show")}
                        >
                          <ShieldAlert className="me-2 h-4 w-4 text-warning" />
                          {rtl ? "لم يحضر" : "Missed booking"}
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget({ type: "single", id: String(b.id) })}
                      >
                        <Trash2 className="me-2 h-4 w-4" />
                        {rtl ? "أرشفة الحجز" : "Archive booking"}
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
  )

  const renderBulkBar = () => {
    if (selectedCount === 0) return null
    return (
      <div className="rounded-3xl border border-border/50 bg-background/90 p-3 shadow-xs sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-2xl">
            {rtl ? "محدد" : "Selected"}: {selectedCount}
          </Badge>
          <Button variant="ghost" className="rounded-2xl" onClick={() => setSelectedIds(new Set())}>
            {rtl ? "إلغاء التحديد" : "Clear"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-2xl">
                <MoreHorizontal className="me-2 h-4 w-4" />
                {rtl ? "إجراءات" : "Actions"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl w-56">
              <DropdownMenuLabel>{rtl ? "تغيير حالة المحدد" : "Change status for selected"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => requestBulkBookingAction("confirm")}>
                <CheckCircle2 className="me-2 h-4 w-4 text-primary" />
                {rtl ? "تأكيد" : "Confirm"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestBulkBookingAction("complete")}>
                <Check className="me-2 h-4 w-4 text-success" />
                {rtl ? "تسجيل الحضور" : "Check in"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestBulkBookingAction("cancel")}>
                <XCircle className="me-2 h-4 w-4 text-destructive" />
                {rtl ? "إلغاء" : "Cancel"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestBulkBookingAction("no_show")}>
                <ShieldAlert className="me-2 h-4 w-4 text-warning" />
                {rtl ? "لم يحضر" : "Missed booking"}
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{rtl ? "إجراءات أخرى" : "Other actions"}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportCsv(true)}>
                <Download className="me-2 h-4 w-4" />
                {rtl ? "تصدير المحدد" : "Export selected"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const ids = Array.from(selectedIds).join(", ")
                  copyText(ids)
                }}
              >
                <Copy className="me-2 h-4 w-4" />
                {rtl ? "نسخ المعرفات" : "Copy IDs"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget({ type: "bulk" })}
              >
                <Trash2 className="me-2 h-4 w-4" />
                {rtl ? "أرشفة المحدد" : "Archive selected"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  const bookingActionDialogCopy = bookingActionTarget
    ? getBookingActionDialogCopy(
        bookingActionTarget.action,
        bookingActionTarget.scope === "bulk" ? bookingActionTarget.ids.length : 1,
      )
    : null

  const clearAdminFilters = useCallback(() => {
    setSearchQuery("")
    setSelectedStatus("all")
    setSelectedCustomerType("all")
    setSelectedCourt("all")
    setSelectedDateRange("all")
    setSort({ key: "date", dir: "desc" })
    setPage(1)
  }, [])

  const adminCourtsForFilter = useMemo(
    () =>
      courtsForFilter.map((c) => ({
        id: String(c.id),
        name: c.name,
        nameEn: c.nameEn || c.name,
      })),
    [courtsForFilter],
  )

  return (
    <div className="space-y-4 pb-6">
      <BookingStatsCards
        stats={adminStats}
        language={language}
        isLoading={bookingsLoading}
        headerTitle={rtl ? "إدارة الحجوزات" : "Bookings"}
        description={rtl ? "بحث وفلترة وإدارة كل الحجوزات" : "Search, filter, and manage all bookings"}
      />

      <Card className="overflow-hidden rounded-3xl border-border/60 shadow-sm">
        <BookingFilters
          embedded
          showViewMode={false}
          language={language}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode="table"
          onViewModeChange={() => {}}
          selectedCourt={selectedCourt}
          onCourtChange={setSelectedCourt}
          selectedDateRange={selectedDateRange}
          onDateRangeChange={(v) => setSelectedDateRange(v as DatePresetKey)}
          sortBy={filterSortBy}
          onSortByChange={(value) => {
            if (value.startsWith("price")) {
              setSort({ key: "amount", dir: value.endsWith("desc") ? "desc" : "asc" })
              return
            }
            if (value === "player_asc") {
              setSort({ key: "date", dir: "asc" })
              return
            }
            setSort({ key: "date", dir: value.endsWith("desc") ? "desc" : "asc" })
          }}
          selectedStatus={selectedStatus}
          onStatusChange={(v) => setSelectedStatus(v as StatusKey)}
          selectedCustomerType={selectedCustomerType}
          onCustomerTypeChange={(v) => setSelectedCustomerType(v as CustomerTypeKey)}
          onClearFilters={clearAdminFilters}
          managerCourts={adminCourtsForFilter}
          statusCounts={statusCounts}
          customerCounts={customerCounts}
        />

        {renderBulkBar()}

        <div className="border-t border-border/50 min-h-[60vh] md:min-h-[800px]">
          {bookingsLoading ? (
            <div className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{rtl ? "جاري تحميل الحجوزات..." : "Loading bookings..."}</span>
            </div>
          ) : totalResults === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarDays}
                title={rtl ? "لا توجد حجوزات" : "No bookings"}
                description={rtl ? "جرّب تغيير الفلاتر أو البحث" : "Try changing filters or search"}
              />
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              {isMobile ? renderMobileCards() : renderDesktopTable()}
              <div className="flex items-center justify-center">
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} rtl={rtl} />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Suspense fallback={null}>
        {detailsBooking && (
          <AdminBookingDetailsDialog
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            booking={detailsBooking}
            language={language}
            locale={locale}
            getPlayerInfo={getPlayerInfo}
            getCourtInfo={getCourtInfo}
            bookingDateTime={bookingDateTime}
            getStatusLabel={getStatusLabel}
            getPaymentLabel={getPaymentLabel}
            onRequestAction={requestSingleBookingAction}
            onArchive={(id) => setDeleteTarget({ type: "single", id })}
          />
        )}
      </Suspense>
      <AlertDialog
        open={!!bookingActionTarget}
        onOpenChange={(open) => {
          if (!open && !isApplyingBookingAction) {
            setBookingActionTarget(null)
          }
        }}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{bookingActionDialogCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{bookingActionDialogCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-2xl" disabled={isApplyingBookingAction}>
              {rtl ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <Button
              variant={bookingActionDialogCopy?.confirmVariant === "destructive" ? "destructive" : "default"}
              className="rounded-2xl"
              disabled={isApplyingBookingAction}
              onClick={applyPendingBookingAction}
            >
              {isApplyingBookingAction ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {bookingActionDialogCopy?.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(val) => !val && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rtl ? "تأكيد الأرشفة" : "Confirm Archive"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "bulk"
                ? (rtl ? `هل أنت متأكد من أرشفة ${selectedCount} حجوزات؟ لا يمكن أرشفة الحجوزات التي بدأت أو تم تسجيل حضورها.` : `Are you sure you want to archive ${selectedCount} bookings? Started, checked-in, and completed bookings cannot be archived.`)
                : (rtl ? "هل أنت متأكد من أرشفة هذا الحجز؟ لا يمكن أرشفة الحجوزات التي بدأت أو تم تسجيل حضورها." : "Are you sure you want to archive this booking? Started, checked-in, and completed bookings cannot be archived.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-2xl" disabled={isDeleting}>
              {rtl ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="rounded-2xl"
              disabled={isDeleting}
              onClick={async () => {
                if (!deleteTarget) return;
                setIsDeleting(true);
                try {
                  if (deleteTarget.type === "single") {
                    await deleteBookingApi(deleteTarget.id);
                    toast.success(rtl ? "تمت الأرشفة بنجاح" : "Archived successfully");
                  } else {
                    const ids = Array.from(selectedIds);
                    const results = await Promise.allSettled(ids.map(id => deleteBookingApi(id)));
                    const hasErrors = results.some(r => r.status === "rejected");
                    if (hasErrors) {
                      toast.error(rtl ? "حدث خطأ في بعض العمليات" : "Some actions failed");
                    } else {
                      toast.success(rtl ? "تمت الأرشفة بنجاح" : "Archived successfully");
                    }
                    setSelectedIds(new Set());
                  }
                  setDeleteTarget(null);
                  await loadBookings();
                } catch (err: any) {
                  toast.error(err?.message || (rtl ? "فشلت الأرشفة" : "Archive failed"));
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              {isDeleting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Trash2 className="me-2 h-4 w-4" />}
              {rtl ? "أرشفة الحجز" : "Archive booking"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
