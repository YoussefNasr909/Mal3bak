"use client"

import type React from "react"
import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import {
  QrCode,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Calendar,
  Banknote,
  Scan,
  Users,
  Search,
  Filter,
  Download,
  History,
  Copy,
  PanelRight,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/components/providers/language-provider"
import {
  listBookings as listBookingsApi,
  verifyBookingCode as verifyBookingCodeApi,
  checkInBooking as checkInBookingApi,
} from "@/lib/api"
import { toast } from "sonner"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { createEgyptDate, parseISODateLocal } from "@/lib/date"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardWelcomeCard } from "@/components/dashboard/shared/dashboard-welcome-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import type { Booking } from "@/lib/types"
import { formatEgyptISODate } from "@/lib/date";
import { format12h } from "@/lib/time"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { hasBookingNote } from "@/lib/booking-notes"
import { BookingNotePanel, BookingNotePopoverButton } from "./bookings/booking-note"

function formatMoneyEGP(n: number, language: string) {
  const val = Number.isFinite(n) ? n : 0
  const formatted = Math.round(val).toLocaleString(language === "ar" ? "ar-EG" : "en-US")
  return language === "ar" ? `${formatted} جنيه` : `${formatted} EGP`
}

/** ---------- UI-only helpers ---------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function formatDuration(ms: number, isAr: boolean) {
  if (ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  const pad = (n: number) => String(n).padStart(2, "0")

  // Uses a clean digital clock format with an LTR marker (\u200E) to prevent Arabic Bidi scrambling
  if (h > 0) {
    return `\u200E${pad(h)}:${pad(m)}:${pad(s)}`
  }
  return `\u200E${pad(m)}:${pad(s)}`
}


function getLocalISODate(d = new Date()) {
  return formatEgyptISODate(d)
}

const CHECK_IN_CODE_LENGTH = 8
const MANAGER_CHECKIN_SELECT_LABEL_ID = "manager-checkin-code-select-label"

function normalizeCheckInCode(value: string) {
  if (value.includes(":")) {
    const parts = value.split(":")
    const last = parts[parts.length - 1] || ""
    if (last.length >= 4) {
      return last.replace(/[^a-zA-Z0-9]/g, "").slice(0, CHECK_IN_CODE_LENGTH).toUpperCase()
    }
  }
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, CHECK_IN_CODE_LENGTH).toUpperCase()
}

function CheckInKpiTile({
  icon,
  label,
  value,
  tone = "primary",
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone?: "primary" | "success" | "warning" | "info"
}) {
  const toneClass =
    {
      primary: "border-primary/20 bg-primary/5 dark:bg-primary/15 dark:border-primary/30 shadow-sm",
      success: "border-success/20 bg-success/5 dark:bg-success/15 dark:border-success/30 shadow-sm",
      warning: "border-warning/20 bg-warning/5 dark:bg-warning/15 dark:border-warning/30 shadow-sm",
      info: "border-info/20 bg-info/5 dark:bg-info/15 dark:border-info/30 shadow-sm",
    }[tone] ?? "border-primary/20 bg-primary/5 dark:bg-primary/15 dark:border-primary/30 shadow-sm"

  const iconClass =
    {
      primary: "text-primary/80 dark:text-primary/90",
      success: "text-success/80 dark:text-success/90",
      warning: "text-warning/80 dark:text-warning/90",
      info: "text-info/80 dark:text-info/90",
    }[tone] ?? "text-primary/80 dark:text-primary/90"

  return (
    <div className={cn("rounded-2xl border p-3.5 transition-colors", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <div className={iconClass}>{icon}</div>
        <p className="text-2xl font-black tabular-nums leading-none text-foreground">{value}</p>
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function FastOTPInput({
  inputKey,
  language,
  initialCode,
  isVerifying,
  onVerify,
}: {
  inputKey: number
  language: string
  initialCode: string
  isVerifying: boolean
  onVerify: (code: string) => void
}) {
  const [localCode, setLocalCode] = useState(initialCode)

  useEffect(() => {
    setLocalCode(initialCode)
  }, [initialCode, inputKey])

  return (
    <div className="space-y-5">
      <div className="flex justify-center overflow-x-clip" dir="ltr">
        <InputOTP
          key={inputKey}
          maxLength={CHECK_IN_CODE_LENGTH}
          type="text"
          inputMode="text"
          pasteTransformer={(v) => v.replace(/[^a-zA-Z0-9]/g, "").slice(0, CHECK_IN_CODE_LENGTH).toUpperCase()}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={language === "ar" ? "أدخل كود تسجيل الحضور" : "Enter the check-in code"}
          value={localCode}
          onChange={(v) => setLocalCode(v.replace(/[^a-zA-Z0-9]/g, "").slice(0, CHECK_IN_CODE_LENGTH).toUpperCase())}
          onComplete={(v) => onVerify(v.replace(/[^a-zA-Z0-9]/g, "").slice(0, CHECK_IN_CODE_LENGTH).toUpperCase())}
        >
          <InputOTPGroup className="gap-1 sm:gap-1.5 md:gap-2.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
                className={cn(
                  "h-11 w-8 sm:w-9 md:w-11 rounded-xl border-[1.5px] text-sm sm:text-base md:text-xl font-semibold tracking-wider sm:tracking-[0.14em] md:tracking-[0.18em]",
                  "bg-background/90 transition-all duration-200 shadow-sm",
                  "focus-visible:ring-2 focus-visible:ring-primary/15",
                  localCode[index] ? "border-primary/45 bg-primary/5 text-primary" : "border-border/85 text-foreground"
                )}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="flex items-stretch gap-2">
        <Button
          onClick={() => onVerify(localCode)}
          disabled={isVerifying || localCode.length !== CHECK_IN_CODE_LENGTH}
          className="h-11 flex-1 rounded-xl text-sm font-semibold shadow-none transition-all active:scale-[0.99] sm:h-12 sm:text-base"
        >
          {isVerifying ? (
            <span className="flex items-center gap-2.5">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {language === "ar" ? "جاري التحقق..." : "Verifying..."}
            </span>
          ) : (
            <>
              <QrCode className="me-2 h-4 w-4 sm:me-2.5 sm:h-4.5 sm:w-4.5" />
              {language === "ar" ? "تحقق" : "Verify"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function SoftSection({
  title,
  description,
  right,
  children,
  rtl = false,
}: {
  title: string
  description?: string
  right?: React.ReactNode
  children: React.ReactNode
  rtl?: boolean
}) {
  return (
    <Card className="rounded-2xl border-border/60 bg-card/70 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/55">
      <CardHeader
        className={cn(
          "flex flex-col items-start justify-between gap-3 text-start sm:flex-row",
          rtl && "items-end text-right sm:flex-row-reverse",
        )}
      >
        <div className={cn("space-y-1 text-start", rtl && "text-right")}>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? <CardDescription className="max-w-2xl">{description}</CardDescription> : null}
        </div>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function getPlayerAvatar(booking?: any) {
  if (!booking) return undefined
  // Checks every possible way the backend might send the image
  return (
    booking?.userAvatar ||
    booking?.playerAvatar ||
    booking?.avatar ||
    booking?.user?.avatar ||
    booking?.player?.avatar ||
    undefined
  )
}

function MiniPill({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-medium transition",
        "bg-background/55 backdrop-blur hover:bg-background/80",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground",
      )}
    >
      {children}
    </button>
  )
}

export function CheckInPage({ mode = "manager" }: { mode?: "manager" | "admin" } = {}) {
  const { language, direction } = useLanguage()
  const isArabic = language === "ar"
  const isAdminMode = mode === "admin"
  const waitingToCheckInLabel =
    language === "ar" ? "بانتظار تسجيل الحضور" : "Waiting to check in"

  const [code, setCode] = useState("")
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    booking?: Booking
    message: string
    unlockTime?: number
  } | null>(null)
  const [verifyInputKey, setVerifyInputKey] = useState(0)
  const [isVerifying, setIsVerifying] = useState(false)
  const verifyInFlightRef = useRef<string | null>(null)
  const lastVerifiedCodeRef = useRef<{ code: string; at: number } | null>(null)
  const verificationResultCardRef = useRef<HTMLDivElement>(null)
  const pendingVerificationScrollRef = useRef(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [filterCourt, setFilterCourt] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterTime, setFilterTime] = useState<string>("all")

  const [bookingsState, setBookingsState] = useState<any[]>([])
  const [isLoadingBookings, setIsLoadingBookings] = useState(true)

  const [activeTab, setActiveTab] = useState("verify")
  const [autoRefresh, setAutoRefresh] = useState(!isAdminMode)

  // UI Enhancements
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [quickPanelOpen, setQuickPanelOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)

  // Confirmation dialog state for dropdown-triggered check-in
  const [pendingCheckIn, setPendingCheckIn] = useState<{
    code: string
    playerName: string
    courtName: string
    timeLabel: string
    priceLabel: string
  } | null>(null)
  
  const [selectValue, setSelectValue] = useState<string>("")

  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable")
  const rowsPerPage = 10
  const [pageIndex, setPageIndex] = useState(0)
  const [nowTick, setNowTick] = useState(Date.now())

  const [columns, setColumns] = useState({
    player: true,
    court: true,
    time: true,
    code: true,
    price: true,
    status: true,
    window: true,
    actions: true,
  })

  // UI Helpers moved up to avoid TDZ (Temporal Dead Zone) in useMemo hooks
  const coerceDisplayDate = useCallback((value: Date | string) => {
    if (value instanceof Date) return value
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISODateLocal(value) : new Date(value)
  }, [])

  const formatDate = useCallback((date: Date | string) => {
    const dateObj = coerceDisplayDate(date)
    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(dateObj)
  }, [coerceDisplayDate, language])

  const formatTime = useCallback((date: Date | string) => {
    const dateObj = coerceDisplayDate(date)
    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(dateObj)
  }, [coerceDisplayDate, language])

  const playSound = useCallback((type: "success" | "error") => {
    if (!soundEnabled) return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioCtx()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.type = "sine"
      if (type === "success") {
        oscillator.frequency.value = 800
        gainNode.gain.setValueAtTime(0.28, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25)
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.25)
      } else {
        oscillator.frequency.value = 280
        gainNode.gain.setValueAtTime(0.28, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.18)
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.18)
      }
    } catch {
      // ignore
    }
  }, [soundEnabled])

  // Real data parsing
  const allBookings = bookingsState
  const today = useMemo(() => getLocalISODate(), []) // Stable today string
  const isCompleted = useCallback((b: any) => b.status === "completed", [])
  const hasCheckInRecord = useCallback(
    (b: any) => isCompleted(b) || b.checkInVerified === true || b.checkedIn === true || Boolean(b.checkedInAt),
    [isCompleted],
  )
  const isCheckedIn = useCallback((b: any) => !isCompleted(b) && hasCheckInRecord(b), [hasCheckInRecord, isCompleted])
  const getBookingStatusMeta = useCallback(
    (booking: any) => {
      if (isCompleted(booking)) {
        return {
          label: language === "ar" ? "مكتمل" : "Completed",
          variant: "info" as const,
        }
      }

      if (isCheckedIn(booking)) {
        return {
          label: language === "ar" ? "تم الحضور" : "Checked In",
          variant: "success" as const,
        }
      }

      return {
        label: waitingToCheckInLabel,
        variant: "warning" as const,
      }
    },
    [isCheckedIn, isCompleted, language, waitingToCheckInLabel],
  )

  const loadBookingsFromApi = useCallback(async () => {
    setIsLoadingBookings(true)
    try {
      const dateStr = getLocalISODate()
      const pageSize = 200
      let page = 1
      let totalPages = 1
      const allItems: any[] = []

      do {
        const res = await listBookingsApi(
          isAdminMode
            ? { status: "no_show", limit: pageSize, page, sortBy: "date", order: "desc" }
            : { date: dateStr, limit: pageSize, page },
        )
        allItems.push(...(res.items || []))
        totalPages = Math.max(1, Number(res.pages || 1))
        page += 1
      } while (page <= totalPages)

      const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values())
      setBookingsState(uniqueItems)
    } catch {
      setBookingsState([])
      toast.error(
        isAdminMode
          ? language === "ar"
            ? "تعذر تحميل الحجوزات الفائتة"
            : "Failed to load missed bookings"
          : language === "ar"
            ? "تعذر تحميل حجوزات اليوم"
            : "Failed to load today's bookings",
      )
    } finally {
      setIsLoadingBookings(false)
    }
  }, [isAdminMode, language])

  useEffect(() => {
    loadBookingsFromApi()
  }, [loadBookingsFromApi])

  useAutoRefresh(loadBookingsFromApi, {
    intervalMs: autoRefresh ? 30_000 : undefined,
    refreshOnVisible: true,
    refreshOnFocus: true,
  })

  // Derive check-in history from real data instead of fake clicks
  const checkInHistory = useMemo(() => {
    return allBookings
      .filter((b) => b.date === today && hasCheckInRecord(b))
      .map((b) => ({
        id: b.id,
        bookingId: b.id,
        playerName: language === "ar" ? b.playerName || b.userName : b.playerNameEn || b.userName,
        playerNameEn: b.playerNameEn || b.userName || b.playerName,
        courtName: b.courtName || "Unknown Court",
        courtNameEn: b.courtNameEn || "Unknown Court",
        checkInTime: b.checkedInAt || b.updatedAt || new Date().toISOString(),
        status: b.status === "completed" ? "completed" : "checked-in",
        avatar: getPlayerAvatar(b),
      }))
  }, [allBookings, today, hasCheckInRecord, language])




  const getPlayerName = useCallback(
    (booking: Booking) => (language === "ar" ? booking.playerName || booking.userName : booking.playerNameEn || booking.userName),
    [language],
  )

  const uniqueCourts = useMemo(() => {
    const courts = new Set<string>()
    allBookings.forEach((b) => {
      if (b.courtId) courts.add(b.courtId)
    })
    return Array.from(courts)
  }, [allBookings])

  const courtOptions = useMemo(() => {
    return uniqueCourts
      .map((courtId) => {
        const sample =
          allBookings.find((b) => b.courtId === courtId && b.date === today) || allBookings.find((b) => b.courtId === courtId)
        const label =
          language === "ar"
            ? (sample?.courtName || courtId)
            : (sample?.courtNameEn || sample?.courtName || courtId)
        return { id: courtId, label }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [uniqueCourts, today, language, allBookings])


  const canCheckIn = useCallback((booking: any) => {
    const now = Date.now()
    if (booking.checkInWindowOpenMs && booking.checkInWindowCloseMs) {
      return now >= booking.checkInWindowOpenMs && now <= booking.checkInWindowCloseMs;
    }
    return booking.canCheckInNow === true;
  }, [])

  const canAdminOverrideMissedBooking = useCallback(
    (booking: any) => isAdminMode && booking?.status === "no_show" && !hasCheckInRecord(booking),
    [hasCheckInRecord, isAdminMode],
  )

  const canRunCheckInAction = useCallback(
    (booking: any) => canAdminOverrideMissedBooking(booking) || canCheckIn(booking),
    [canAdminOverrideMissedBooking, canCheckIn],
  )

  const getWindowInfo = useCallback(
    (booking: any) => {
      let state = booking.windowState || "late";
      let msLeft = booking.windowMsLeft || 0;

      if (booking.checkInWindowOpenMs && booking.checkInWindowCloseMs) {
        if (nowTick < booking.checkInWindowOpenMs) {
          state = "early";
          msLeft = booking.checkInWindowOpenMs - nowTick;
        } else if (nowTick > booking.checkInWindowCloseMs) {
          state = "late";
          msLeft = 0;
        } else {
          state = "open";
          msLeft = booking.checkInWindowCloseMs - nowTick;
        }
      }

      if (state === "early") {
        return { state, label: language === "ar" ? `يفتح بعد ${formatDuration(msLeft, true)}` : `Opens in ${formatDuration(msLeft, false)}` }
      }
      if (state === "late") {
        return { state, label: language === "ar" ? "انتهى وقت الحجز" : "Booking Expired" }
      }
      return { state, label: language === "ar" ? `متاح • ${formatDuration(msLeft, true)}` : `Open • ${formatDuration(msLeft, false)}` }
    },
    [language, nowTick],
  )


  // Filter + search bookings
  const filteredBookings = useMemo(() => {
    // Note: allBookings is already pre-filtered by date on the backend to include overlaps
    let bookings = allBookings.filter((b) =>
      isAdminMode
        ? b.status === "no_show" || b.status === "completed"
        : b.status === "confirmed" || b.status === "completed",
    )

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      bookings = bookings.filter((b) => {
        const court = (language === "ar" ? b.courtName : b.courtNameEn) || ""
        return (
          getPlayerName(b).toLowerCase().includes(q) ||
          (b.checkInCode || "").toLowerCase().includes(q) ||
          court.toLowerCase().includes(q)
        )
      })
    }

    if (filterCourt !== "all") {
      bookings = bookings.filter((b) => b.courtId === filterCourt)
    }

    if (filterStatus !== "all") {
      if (filterStatus === "checked-in") bookings = bookings.filter((b) => hasCheckInRecord(b))
      if (filterStatus === "pending") bookings = bookings.filter((b) => !hasCheckInRecord(b))
    }

    if (filterTime !== "all") {
      const now = Date.now()
      bookings = bookings.filter((b) => {
        const [y, m, d] = b.date.split("-").map(Number)
        const [sH, sM] = b.startTime.split(":").map(Number)
        const [eH, eM] = b.endTime.split(":").map(Number)

        const start = createEgyptDate(y, m, d, sH, sM).getTime()
        let end = createEgyptDate(y, m, d, eH, eM).getTime()
        if (end <= start) end += 24 * 60 * 60 * 1000

        if (filterTime === "upcoming") return start > now
        if (filterTime === "current") return start <= now && end > now
        if (filterTime === "past") return end <= now
        return true
      })
    }

    return bookings.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime)
      return (a.id || "").localeCompare(b.id || "")
    })
  }, [searchQuery, filterCourt, filterStatus, filterTime, language, getPlayerName, allBookings, hasCheckInRecord, isAdminMode])

  // Statistics
  const stats = useMemo(() => {
    const todayBookings = allBookings.filter((b) =>
      isAdminMode
        ? b.status === "no_show" || b.status === "completed"
        : b.status === "confirmed" || b.status === "completed",
    )
    const checkedInCount = todayBookings.filter((b) => hasCheckInRecord(b)).length
    const pending = todayBookings.length - checkedInCount
    const rate = todayBookings.length > 0 ? (checkedInCount / todayBookings.length) * 100 : 0
    const windowOpenCount = todayBookings.filter((b) => !hasCheckInRecord(b) && canRunCheckInAction(b)).length

    const byCourt = todayBookings.reduce((acc, b) => {
      const courtName = language === "ar" ? b.courtName : b.courtNameEn
      if (!acc[courtName]) acc[courtName] = { total: 0, checkedIn: 0 }
      acc[courtName].total++
      if (hasCheckInRecord(b)) acc[courtName].checkedIn++
      return acc
    }, {} as Record<string, { total: number; checkedIn: number }>)

    const byCourtRows = Object.entries(byCourt)
      .map(([courtName, v]: [string, any]) => ({
        courtName,
        total: v.total,
        checkedIn: v.checkedIn,
        rate: v.total > 0 ? Math.round((v.checkedIn / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return {
      total: todayBookings.length,
      checkedIn: checkedInCount,
      pending,
      checkInRate: Math.round(rate),
      windowOpenCount,
      byCourt,
      byCourtRows,
    }
  }, [language, canRunCheckInAction, allBookings, hasCheckInRecord, isAdminMode])

  const copyToClipboard = async (text: string, msg?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(msg || (language === "ar" ? "تم النسخ" : "Copied"))
    } catch {
      toast.error(language === "ar" ? "فشل النسخ" : "Copy failed")
    }
  }

  const downloadHistoryCSV = () => {
    if (checkInHistory.length === 0) return

    const csvEscape = (val: any) => {
      const s = String(val ?? "")
      const escaped = s.replace(/"/g, '""')
      return `"${escaped}"`
    }

    const headers = [
      language === "ar" ? "اللاعب" : "Player",
      language === "ar" ? "الملعب" : "Court",
      language === "ar" ? "وقت الحضور" : "Check-in Time",
      language === "ar" ? "الحالة" : "Status",
      "bookingId",
    ]

    const rows = checkInHistory.map((h) => [
      language === "ar" ? h.playerName : h.playerNameEn,
      language === "ar" ? h.courtName : h.courtNameEn,
      h.checkInTime,
      h.status,
      h.bookingId,
    ])

    // Generate CSV string
    const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")

    // Create Blob with UTF-8 BOM so Excel reads Arabic correctly
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `check-in-history-${today}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

 const handleVerify = async (verifyCode?: string) => {
  const codeToVerify = normalizeCheckInCode(verifyCode || code)
  if (!codeToVerify || codeToVerify.length !== CHECK_IN_CODE_LENGTH) {
    toast.error(language === "ar" ? "يرجى إدخال رمز صحيح من 8 رموز" : "Please enter a valid 8-character code")
    return
  }

    const now = Date.now()
    if (verifyInFlightRef.current === codeToVerify) {
      return
    }

    if (
      lastVerifiedCodeRef.current &&
      lastVerifiedCodeRef.current.code === codeToVerify &&
      now - lastVerifiedCodeRef.current.at < 2000
    ) {
      return
    }

    verifyInFlightRef.current = codeToVerify
    setIsVerifying(true)

    try {
      const res = await verifyBookingCodeApi(codeToVerify, language);

      pendingVerificationScrollRef.current = true
      setVerificationResult({
        success: true,
        booking: res.booking as Booking,
        message: res.message || (language === "ar" ? "تم تسجيل الحضور بنجاح!" : "Check-in successful!"),
      })

      lastVerifiedCodeRef.current = { code: codeToVerify, at: Date.now() }
      toast.success(language === "ar" ? "تم تسجيل الحضور بنجاح" : "Check-in successful")
      playSound("success")
      setCode("")
      await loadBookingsFromApi()
    } catch (error: any) {
      const message = String(error?.message || "")
      const isImmediateDuplicate =
        lastVerifiedCodeRef.current?.code === codeToVerify &&
        Date.now() - lastVerifiedCodeRef.current.at < 3000 &&
        (/already been checked in/i.test(message) || /already checked in/i.test(message) || /تم تسجيل حضور/.test(message))

      if (isImmediateDuplicate) {
        return
      }

      let errorMsg = error?.message || (language === "ar" ? "رمز غير صالح" : "Invalid code");
      let parsedUnlockTime: number | undefined = undefined;

      // Smart parsing of the backend's static wait time into a dynamic ticking timer
      if (errorMsg.includes("Please wait") || errorMsg.includes("يرجى الانتظار")) {
        let ms = 0;
        const hMatch = errorMsg.match(/(\d+)\s*(hours|hour|ساعات|ساعة)/i);
        const mMatch = errorMsg.match(/(\d+)\s*(minutes|minute|دقيقة|دقائق)/i);
        const sMatch = errorMsg.match(/(\d+)\s*(seconds|second|ثواني|ثانية)/i);

        if (hMatch) ms += Number.parseInt(hMatch[1]) * 3600000;
        if (mMatch) ms += Number.parseInt(mMatch[1]) * 60000;
        if (sMatch) ms += Number.parseInt(sMatch[1]) * 1000;

        if (ms > 0) {
          parsedUnlockTime = Date.now() + ms;
          // Strip out the ugly static text so we can replace it with our UI badge
          errorMsg = errorMsg.replace(/Please wait.*/i, "").replace(/يرجى الانتظار.*/i, "").trim();
        }
      }

      pendingVerificationScrollRef.current = true
      setVerificationResult({
        success: false,
        message: errorMsg,
        unlockTime: parsedUnlockTime,
      })
      playSound("error")
    } finally {
      if (verifyInFlightRef.current === codeToVerify) {
        verifyInFlightRef.current = null
      }
      setIsVerifying(false)
    }
  }

  const handleQuickCheckIn = async (bookingId: string) => {
    try {
      const result = await checkInBookingApi(bookingId, language)
      const booking = result.booking as any

      pendingVerificationScrollRef.current = true
      setVerificationResult({
        success: true,
        booking: booking,
        message: language === "ar" ? "تم تسجيل الحضور بنجاح" : "Check-in successful"
      })

      toast.success(language === "ar" ? "تم تسجيل الحضور بنجاح" : "Check-in successful")
      playSound("success")
      await loadBookingsFromApi()
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "فشل تسجيل الحضور" : "Check-in failed"))
      playSound("error")
    }
  }


  const handleReset = () => {
    setCode("")
    setVerificationResult(null)
    setVerifyInputKey((value) => value + 1)
    setSelectValue("")
  }

  const verificationUnlockTime = verificationResult?.unlockTime

  // Live clock for window countdowns — only on active tabs, slower tick unless unlock timer is shown
  useEffect(() => {
    if (activeTab === "history") return

    const unlockActive =
      Boolean(verificationUnlockTime) &&
      verificationUnlockTime! > Date.now()
    const tickMs = 1000
    setNowTick(Date.now())
    const interval = setInterval(() => setNowTick(Date.now()), tickMs)
    return () => clearInterval(interval)
  }, [activeTab, verificationUnlockTime])
  useEffect(() => {
    if (!verificationResult || !pendingVerificationScrollRef.current) return

    pendingVerificationScrollRef.current = false
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return

    const timeout = window.setTimeout(() => {
      verificationResultCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)

    return () => window.clearTimeout(timeout)
  }, [verificationResult])
  useEffect(() => setPageIndex(0), [searchQuery, filterCourt, filterStatus, filterTime])
  useEffect(() => setVerificationResult(null), [language])

  const totalRows = filteredBookings.length
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const safePage = clamp(pageIndex, 0, totalPages - 1)
  const start = safePage * rowsPerPage
  const end = start + rowsPerPage
  const pagedBookings = useMemo(() => filteredBookings.slice(start, end), [filteredBookings, start, end])

  const rowPad = density === "compact" ? "py-2" : "py-3"

  const todaysCodes = useMemo(() => {
    return allBookings
      .filter((b) =>
        (isAdminMode ? b.status === "no_show" : b.status === "confirmed") &&
        !hasCheckInRecord(b) &&
        b.checkInCode,
      )
      .sort((a, b) => {
        // Sort by date then startTime, descending (newest missed bookings first)
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.startTime.localeCompare(a.startTime);
      })
      .slice(0, 50) // Limit to 50 items to prevent DOM lag
      .map((b) => {
        const playerName = getPlayerName(b)
        const courtName = (language === "ar" ? b.courtName : b.courtNameEn) || b.courtName || b.courtNameEn || ""
        const cityName = (language === "ar" ? b.courtCity : b.courtCityEn) || b.courtCity || b.courtCityEn || ""
        const timeLabel = `${format12h(b.startTime, language)} - ${format12h(b.endTime, language)}`
        const priceLabel = formatMoneyEGP(b.totalPrice || b.amount || 0, language)

        return {
          id: b.id,
          code: b.checkInCode!,
          playerName,
          courtName,
          cityName,
          dateLabel: formatDate(b.date),
          timeLabel,
          priceLabel,
          label: `${playerName} - ${courtName}`,
        }
      })
  }, [language, getPlayerName, allBookings, hasCheckInRecord, isAdminMode, formatDate])

  const openQuickPanel = (booking: Booking) => {
    setSelectedBooking(booking)
    setQuickPanelOpen(true)
  }

  const visibleColSpan = Object.values(columns).filter(Boolean).length

  const windowBadgeFor = (booking: Booking) => {
    const w = getWindowInfo(booking)
    if (hasCheckInRecord(booking)) {
      return null
    }
    if (w.state === "open") {
      return (
        <Badge variant="outline" className="rounded-xl bg-success/10 border-success/30 text-success">
          {w.label}
        </Badge>
      )
    }
    if (w.state === "early") {
      return (
        <Badge variant="outline" className="rounded-xl bg-warning/10 border-warning/30 text-warning">
          {w.label}
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="rounded-xl bg-destructive/10 border-destructive/30 text-destructive">
        {w.label}
      </Badge>
    )
  }

  const renderBookingsTableHeaderCells = () => {
    if (isArabic) {
      return (
        <>
          {columns.player && <TableHead className="min-w-[200px] whitespace-nowrap">{isArabic ? "اللاعب" : "Player"}</TableHead>}
          {columns.time && <TableHead className="min-w-[180px] whitespace-nowrap">{isArabic ? "الوقت" : "Time"}</TableHead>}
          {columns.code && <TableHead className="min-w-[160px] whitespace-nowrap">{isArabic ? "الكود" : "Code"}</TableHead>}
          {columns.status && <TableHead className="min-w-[140px] whitespace-nowrap">{isArabic ? "الحالة" : "Status"}</TableHead>}
          {columns.window && <TableHead className="min-w-[140px] whitespace-nowrap">{isArabic ? "النافذة" : "Window"}</TableHead>}
          {columns.court && <TableHead className="min-w-[220px] whitespace-nowrap">{isArabic ? "الملعب" : "Court"}</TableHead>}
          {columns.price && <TableHead className="min-w-[120px] whitespace-nowrap">{isArabic ? "السعر" : "Price"}</TableHead>}
          {columns.actions && <TableHead className="text-left min-w-[240px] whitespace-nowrap">{isArabic ? "إجراءات" : "Actions"}</TableHead>}
        </>
      )
    }

    return (
      <>
        {columns.player && <TableHead className="min-w-[200px] whitespace-nowrap">{isArabic ? "اللاعب" : "Player"}</TableHead>}
        {columns.time && <TableHead className="min-w-[180px] whitespace-nowrap">{isArabic ? "الوقت" : "Time"}</TableHead>}
        {columns.code && <TableHead className="min-w-[160px] whitespace-nowrap">{isArabic ? "الكود" : "Code"}</TableHead>}
        {columns.status && <TableHead className="min-w-[140px] whitespace-nowrap">{isArabic ? "الحالة" : "Status"}</TableHead>}
        {columns.window && <TableHead className="min-w-[140px] whitespace-nowrap">{isArabic ? "النافذة" : "Window"}</TableHead>}
        {columns.court && <TableHead className="min-w-[220px] whitespace-nowrap">{isArabic ? "الملعب" : "Court"}</TableHead>}
        {columns.price && <TableHead className="min-w-[120px] whitespace-nowrap">{isArabic ? "السعر" : "Price"}</TableHead>}
        {columns.actions && <TableHead className="text-end min-w-[240px] whitespace-nowrap">{isArabic ? "إجراءات" : "Actions"}</TableHead>}
      </>
    )
  }

  const renderBookingTableRowCells = (booking: Booking) => {
    const canCheckInNow = canRunCheckInAction(booking)
    const statusMeta = getBookingStatusMeta(booking)

    const playerCell = columns.player ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap")}>
        <div className={cn("flex items-center gap-3", isArabic && "flex-row-reverse text-right")}>
          <Avatar className="h-10 w-10 ring-2 ring-border/20 shadow-sm">
            <AvatarImage src={getPlayerAvatar(booking)} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm uppercase">{getPlayerName(booking).charAt(0)}</AvatarFallback>
          </Avatar>
          <div className={cn("min-w-0", isArabic && "text-right")}>
            <p className="font-extrabold text-sm text-primary truncate drop-shadow-sm">{getPlayerName(booking)}</p>
          </div>
        </div>
      </TableCell>
    ) : null

    const courtCell = columns.court ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap")}>
        <span className="block truncate font-medium text-muted-foreground">{language === "ar" ? booking.courtName : booking.courtNameEn}</span>
      </TableCell>
    ) : null

    const timeCell = columns.time ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap")}>
        <div className={cn("flex items-center gap-2", isArabic && "flex-row-reverse justify-end")}>
          <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span className="font-mono text-sm font-bold text-foreground/80">
            {format12h(booking.startTime, language)} - {format12h(booking.endTime, language)}
          </span>
        </div>
      </TableCell>
    ) : null

    const codeCell = columns.code ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap")}>
        <div className={cn("flex items-center gap-2", isArabic && "flex-row-reverse justify-end")}>
          <span className="font-mono font-black tracking-widest text-sm text-foreground">{booking.checkInCode || "—"}</span>
          {booking.checkInCode ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={(e) => {
                e.stopPropagation()
                copyToClipboard(booking.checkInCode!, language === "ar" ? "تم نسخ الكود" : "Code copied")
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </TableCell>
    ) : null

    const priceCell = columns.price ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap")}>
        <div className={cn("flex items-center gap-1.5", isArabic && "flex-row-reverse justify-end")}>
          <Banknote className="h-3.5 w-3.5 text-emerald-600/70" />
          <span className="font-bold text-sm text-emerald-600">
            {formatMoneyEGP(booking.totalPrice ?? booking.amount ?? 0, language)}
          </span>
        </div>
      </TableCell>
    ) : null

    const statusCell = columns.status ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap")}>
        <StatusBadge variant={statusMeta.variant} dot>
          {statusMeta.label}
        </StatusBadge>
      </TableCell>
    ) : null

    const windowCell = columns.window ? (
      <TableCell className={cn(rowPad, "text-muted-foreground whitespace-nowrap")}>{windowBadgeFor(booking) ?? "—"}</TableCell>
    ) : null

    const actionsCell = columns.actions ? (
      <TableCell className={cn(rowPad, "whitespace-nowrap", isArabic ? "text-left" : "text-end")}>
        <div className={cn("flex items-center gap-2", isArabic ? "justify-start" : "justify-end")}>
          <div onClick={(e) => e.stopPropagation()}>
            <BookingNotePopoverButton
              note={booking.notes}
              language={language}
              align={isArabic ? "start" : "end"}
              iconOnly
              className={cn("h-9 w-9 rounded-2xl", isArabic && "order-last")}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              openQuickPanel(booking)
            }}
            className="rounded-2xl border-border/60 bg-background/60 backdrop-blur hover:bg-background/80"
          >
            <PanelRight className="me-1 h-3.5 w-3.5" />
            {language === "ar" ? "تفاصيل" : "Details"}
          </Button>

          {!hasCheckInRecord(booking) ? (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleQuickCheckIn(booking.id)
              }}
              disabled={!canCheckInNow}
              className="rounded-xl"
            >
              <CheckCircle2 className="me-1 h-3.5 w-3.5" />
              {language === "ar" ? "تسجيل" : "Check In"}
            </Button>
          ) : null}
        </div>
      </TableCell>
    ) : null

    if (isArabic) {
      return (
        <>
          {playerCell}
          {timeCell}
          {codeCell}
          {statusCell}
          {windowCell}
          {courtCell}
          {priceCell}
          {actionsCell}
        </>
      )
    }

    return (
      <>
        {playerCell}
        {timeCell}
        {codeCell}
        {statusCell}
        {windowCell}
        {courtCell}
        {priceCell}
        {actionsCell}
      </>
    )
  }

  const renderHistoryTableHeaderCells = () => {
    if (isArabic) {
      return (
        <>
          <TableHead>{isArabic ? "الحالة" : "Status"}</TableHead>
          <TableHead>{isArabic ? "وقت الحضور" : "Check-in Time"}</TableHead>
          <TableHead>{isArabic ? "الملعب" : "Court"}</TableHead>
          <TableHead>{isArabic ? "اللاعب" : "Player"}</TableHead>
        </>
      )
    }

    return (
      <>
        <TableHead>{isArabic ? "اللاعب" : "Player"}</TableHead>
        <TableHead>{isArabic ? "الملعب" : "Court"}</TableHead>
        <TableHead>{isArabic ? "وقت الحضور" : "Check-in Time"}</TableHead>
        <TableHead>{isArabic ? "الحالة" : "Status"}</TableHead>
      </>
    )
  }

  const renderHistoryRowCells = (entry: (typeof checkInHistory)[number]) => {
    const playerCell = (
      <TableCell>
        <div className={cn("flex items-center gap-3", isArabic && "flex-row-reverse text-right")}>
          <Avatar className="h-8 w-8 ring-1 ring-border/60">
            <AvatarImage src={entry.avatar} />
            <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg uppercase">
              {(isArabic ? entry.playerName : entry.playerNameEn).charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{isArabic ? entry.playerName : entry.playerNameEn}</span>
        </div>
      </TableCell>
    )

    const courtCell = <TableCell>{isArabic ? entry.courtName : entry.courtNameEn}</TableCell>

    const timeCell = (
      <TableCell>
        <div className={cn("flex items-center gap-2", isArabic && "flex-row-reverse justify-end")}>
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm">{formatTime(entry.checkInTime)}</span>
        </div>
      </TableCell>
    )

    const statusCell = (
      <TableCell>
        <StatusBadge variant={entry.status === "completed" ? "info" : "success"} dot>
          {entry.status === "completed"
            ? isArabic
              ? "مكتمل"
              : "Completed"
            : isArabic
              ? "حاضر"
              : "Checked In"}
        </StatusBadge>
      </TableCell>
    )

    if (isArabic) {
      return (
        <>
          {statusCell}
          {timeCell}
          {courtCell}
          {playerCell}
        </>
      )
    }

    return (
      <>
        {playerCell}
        {courtCell}
        {timeCell}
        {statusCell}
      </>
    )
  }

  const heroTitle = isAdminMode
    ? language === "ar"
      ? "تسجيل الحضور — فائت"
      : "Missed check-in"
    : language === "ar"
      ? "تسجيل الحضور"
      : "Check-in"

  const heroDescription = isAdminMode
    ? language === "ar"
      ? "تسجيل حضور الحجوزات الفائتة فقط"
      : "Check in missed bookings only"
    : language === "ar"
      ? "تحقق من الحجوزات عبر الكود أو القائمة."
      : "Verify bookings via code or selection."

  const heroDetail = isAdminMode
    ? language === "ar"
      ? "الحجوزات المستقبلية مقفلة حتى وقتها."
      : "Future bookings stay locked until their time."
    : language === "ar"
      ? "تفتح نافذة الحضور قبل 10 دقائق من البدء."
      : "Window opens 10m before start."

  return (
    <div
      dir={direction}
      className={cn(
        "space-y-4 pb-[calc(var(--mobile-bottom-nav-offset,0rem)+1rem)] text-start md:pb-8",
        isArabic && "text-right",
      )}
    >
      <DashboardWelcomeCard title={heroTitle} description={heroDescription} detail={heroDetail} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <CheckInKpiTile
          tone="primary"
          icon={<Users className="h-4 w-4" />}
          value={isLoadingBookings ? "—" : stats.total}
          label={
            isAdminMode
              ? language === "ar"
                ? "فائت"
                : "Missed"
              : language === "ar"
                ? "إجمالي اليوم"
                : "Today total"
          }
        />
        <CheckInKpiTile
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
          value={isLoadingBookings ? "—" : stats.checkedIn}
          label={language === "ar" ? "تم الحضور" : "Checked in"}
        />
        <CheckInKpiTile
          tone="warning"
          icon={<Clock className="h-4 w-4" />}
          value={isLoadingBookings ? "—" : stats.pending}
          label={waitingToCheckInLabel}
        />
        <CheckInKpiTile
          tone="info"
          icon={<Scan className="h-4 w-4" />}
          value={isLoadingBookings ? "—" : stats.windowOpenCount}
          label={language === "ar" ? "متاح الآن" : "Open now"}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex w-full overflow-x-auto scrollbar-hide">
          <TabsList
            className={cn(
              "flex h-10 min-w-max items-center justify-start rounded-xl bg-muted/50 p-1 sm:w-full sm:justify-center",
              isArabic && "flex-row-reverse",
            )}
          >
            <TabsTrigger
              value="verify"
              className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
            >
              <Scan className={cn("h-4 w-4", isArabic ? "ms-2" : "me-2")} />
              {language === "ar" ? "التحقق" : "Verify"}
            </TabsTrigger>
            <TabsTrigger
              value="bookings"
              className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
            >
              <Calendar className={cn("h-4 w-4", isArabic ? "ms-2" : "me-2")} />
              {language === "ar" ? "الحجوزات" : "Bookings"}
              {!isLoadingBookings && stats.pending > 0 ? (
                <span className="ms-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-warning/15 px-1.5 text-[10px] font-bold text-warning">
                  {stats.pending}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm sm:flex-1 sm:px-6 sm:text-sm"
            >
              <History className={cn("h-4 w-4", isArabic ? "ms-2" : "me-2")} />
              {language === "ar" ? "السجل" : "History"}
            </TabsTrigger>
          </TabsList>
        </div>

        <div>
            {/* Verify Tab */}
            <TabsContent value="verify" className="space-y-4 sm:space-y-6">
              <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              <div className={cn(language === "ar" && "lg:order-2")}>
                  <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className={cn("px-4 pb-2 pt-4 text-start sm:px-5", language === "ar" && "items-end text-right")}>
                      <CardTitle className="text-lg font-bold tracking-tight">
                        {language === "ar" ? "رمز الحضور" : "Check-in code"}
                      </CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">
                        {language === "ar"
                          ? "اكتب الرمز أو اختر من القائمة"
                          : "Type the code or pick from the list"}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className={cn("space-y-4 px-4 pb-5 sm:px-5", language === "ar" && "text-right")}>
                      <div className="order-1 space-y-4">
                      <FastOTPInput
                        inputKey={verifyInputKey}
                        language={language}
                        initialCode={code}
                        isVerifying={isVerifying}
                        onVerify={(v: string) => {
                          setCode(v)
                          handleVerify(v)
                        }}
                      />

                      <div className="relative flex items-center">
                        <div className="flex-grow border-t border-border/40" />
                        <span className="mx-3 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {language === "ar" ? "أو اختر" : "or pick"}
                        </span>
                        <div className="flex-grow border-t border-border/40" />
                      </div>
                      </div>

                      <div className="order-2 space-y-2.5">
                        <Label id={MANAGER_CHECKIN_SELECT_LABEL_ID} className={cn("block px-1 text-sm font-semibold text-foreground/80", language === "ar" && "text-right")}>
                          {language === "ar"
                            ? isAdminMode
                              ? "اختر من الحجوزات الفائتة"
                              : "اختر من حجوزات اليوم"
                            : isAdminMode
                              ? "Pick from missed bookings"
                              : "Pick from today's bookings"}
                        </Label>
                        <Select
                          key={verifyInputKey}
                          value={selectValue}
                          onValueChange={(v) => {
                            setSelectValue(v)
                            if (v && v !== "__none__") {
                              const entry = todaysCodes.find((c) => c.code === v)
                              if (entry) {
                                setPendingCheckIn({
                                  code: v,
                                  playerName: entry.playerName,
                                  courtName: entry.courtName,
                                  timeLabel: entry.timeLabel,
                                  priceLabel: entry.priceLabel,
                                })
                              } else {
                                setCode(v)
                                handleVerify(v)
                              }
                            }
                          }}
                        >
                          <SelectTrigger aria-labelledby={MANAGER_CHECKIN_SELECT_LABEL_ID} aria-label={language === "ar" ? "اختر رمز حضور من حجوزات اليوم" : isAdminMode ? "Select a check-in code from missed bookings" : "Select a check-in code from today's bookings"} className={cn("h-12 w-full rounded-xl border-border/60 bg-background px-3 text-sm font-medium shadow-sm", language === "ar" && "flex-row-reverse text-right [&_[data-slot=select-value]]:justify-end")}>
                            <SelectValue placeholder={language === "ar" ? "اختر رمز حضور..." : "Select a check-in code..."}>
                              {selectValue && selectValue !== "__none__" ? (
                                <span className="flex items-center gap-2 truncate min-w-0 w-full">
                                  <span className="font-mono font-bold tracking-widest shrink-0">{selectValue}</span>
                                  <span className="truncate text-muted-foreground opacity-80 text-sm">
                                    {todaysCodes.find(c => c.code === selectValue)?.playerName}
                                  </span>
                                </span>
                              ) : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent dir={language === "ar" ? "rtl" : "ltr"} className={cn("w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] rounded-[1.75rem] border-border/60 shadow-xl", language === "ar" && "text-right")}>
                            {todaysCodes.length === 0 ? (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                {language === "ar"
                                  ? isAdminMode
                                    ? "لا توجد حجوزات فائتة"
                                    : "لا توجد حجوزات متاحة حالياً"
                                  : isAdminMode
                                    ? "No missed bookings found"
                                    : "No available bookings now"}
                              </div>
                            ) : (
                              todaysCodes.map((c) => (
                                <SelectItem
                                  key={c.id}
                                  value={c.code}
                                  textValue={
                                    isAdminMode
                                      ? `${c.code} ${c.playerName} ${c.courtName} ${c.cityName} ${c.dateLabel} ${c.timeLabel} ${c.priceLabel}`
                                      : c.label
                                  }
                                  className={cn(
                                    "rounded-2xl px-3 py-3 font-medium transition-all duration-300",
                                    "relative group",
                                    "border-b border-border/40 last:border-0 hover:bg-primary/[0.03]",
                                    language === "ar" && "text-right",
                                  )}
                                >
                                  {/* Modern Gradient Separator */}
                                  <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-border/60 to-transparent group-last:hidden" />

                                  <div className={cn("flex flex-col gap-1 w-full relative z-10", language === "ar" && "text-right")}>
                                    <div className="flex items-center justify-between">
                                      <span className="block font-mono text-[13px] font-bold tracking-[0.14em] text-muted-foreground" dir="ltr">
                                        {c.code}
                                      </span>
                                      <span className="text-[13px] font-bold text-success whitespace-nowrap drop-shadow-sm">{c.priceLabel}</span>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 text-[14px] min-w-0">
                                      <span className="font-semibold text-foreground whitespace-nowrap shrink-0">
                                        {c.playerName}
                                      </span>
                                      <span className={cn("truncate text-muted-foreground text-[12.5px]", language === "ar" ? "text-left" : "text-right")}>
                                        {c.courtName}
                                        {c.cityName ? ` • ${c.cityName}` : ""}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 mt-0.5 text-[11.5px] font-medium text-muted-foreground/80">
                                      <div className={cn("flex items-center gap-1.5", language === "ar" && "flex-row-reverse")}>
                                        <Clock className="h-3 w-3 shrink-0 opacity-70" />
                                        <span dir="ltr" className="font-medium">{c.timeLabel}</span>
                                      </div>
                                      {isAdminMode && (
                                        <div className={cn("flex items-center gap-1.5", language === "ar" && "flex-row-reverse")}>
                                          <div className="h-2 w-[1px] bg-border/60 mx-0.5" />
                                          <Calendar className="h-3 w-3 opacity-70" />
                                          <span className="font-medium">{c.dateLabel}</span>
                                          <Badge variant="outline" className="ms-1 shrink-0 rounded-lg border-destructive/20 bg-destructive/5 px-1.5 py-0 text-[9px] font-bold text-destructive">
                                            {language === "ar" ? "فائت" : "Missed"}
                                          </Badge>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        variant="outline"
                        onClick={handleReset}
                        disabled={!code && !verificationResult && !selectValue}
                        className="h-10 w-full rounded-xl"
                      >
                        {language === "ar" ? "مسح وبدء جديد" : "Clear and start over"}
                      </Button>
                    </CardContent>
                  </Card>
              </div>

              <div ref={verificationResultCardRef} className={cn(language === "ar" && "lg:order-1")}>
                  <Card
                      className={cn(
                        "overflow-hidden rounded-2xl border shadow-sm",
                        verificationResult
                          ? verificationResult.success
                            ? "border-success/25 bg-success/5"
                            : "border-destructive/25 bg-destructive/5"
                          : "border-border/60",
                      )}
                  >
                    <CardContent className="p-5 sm:p-8">
                      {!verificationResult ? (
                        <div className="flex min-h-[220px] flex-col items-center justify-center text-center sm:min-h-[320px]">
                          <div className="flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-muted/35 ring-1 ring-border/60 sm:h-16 sm:w-16 sm:rounded-[1.35rem]">
                            <QrCode className="h-6 w-6 text-muted-foreground sm:h-7 sm:w-7" />
                          </div>
                          <h2 className="mt-4 text-lg font-semibold tracking-tight sm:mt-5 sm:text-xl">{language === "ar" ? "أدخل رمز الحضور" : "Enter Check-in Code"}</h2>
                          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground sm:leading-7">
                            {language === "ar" ? "ستظهر نتيجة التحقق هنا بعد إدخال الرمز" : "Verification result will appear here after entering the code"}
                          </p>
                        </div>
                      ) : (
                        <div className={cn(language === "ar" ? "text-right" : "text-center")}>
                          <div
                            className={cn(
                              "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl",
                              verificationResult.success ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {verificationResult.success ? (
                              <CheckCircle2 className="h-9 w-9" />
                            ) : (
                              <XCircle className="h-9 w-9" />
                            )}
                          </div>

                          <h2 className={cn("mt-5 text-xl font-black tracking-tight", verificationResult.success ? "text-success" : "text-destructive")}>
                            {verificationResult.success ? (language === "ar" ? "تم تسجيل الحضور" : "Check-in successful") : language === "ar" ? "فشل التحقق" : "Verification Failed"}
                          </h2>

                          <div className="mt-2">
                            <p className="mx-auto max-w-md text-sm leading-7 text-muted-foreground" dir={language === "ar" ? "rtl" : "ltr"}>{verificationResult.message}</p>
                            {verificationResult.unlockTime && (
                              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-medium text-warning shadow-none">
                                {verificationResult.unlockTime - nowTick > 0 ? (
                                  <>
                                    <Clock className="h-4 w-4 animate-pulse" />
                                    <span>{language === "ar" ? "يفتح بعد:" : "Opens in:"}</span>
                                    <span className="font-mono tracking-wide" dir="ltr">{formatDuration(verificationResult.unlockTime - nowTick, language === "ar")}</span>
                                  </>
                                ) : (
                                  <span className="text-success flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {language === "ar" ? "متاح الآن! أعد المحاولة." : "Available now! Try again."}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {verificationResult.booking && (
                            <div className="mt-5 w-full rounded-xl border border-border/60 bg-card p-4 text-start">
                              <div className={cn("flex items-center justify-between gap-3", language === "ar" && "flex-row-reverse")}>
                                <div className={cn("flex min-w-0 items-center gap-3", language === "ar" && "flex-row-reverse text-right")}>
                                  <Avatar className="h-12 w-12 ring-1 ring-border/60">
                                    <AvatarImage src={getPlayerAvatar(verificationResult.booking)} />
                                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg uppercase">{getPlayerName(verificationResult.booking).charAt(0)}</AvatarFallback>
                                  </Avatar>

                                  <div className="min-w-0 text-start">
                                    <p className="font-semibold truncate">{getPlayerName(verificationResult.booking)}</p>
                                    <p className="text-xs text-muted-foreground">{language === "ar" ? "اللاعب" : "Player"}</p>
                                  </div>
                                </div>

                                {verificationResult.booking.checkInCode && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-2xl bg-transparent"
                                    onClick={() => copyToClipboard(verificationResult.booking!.checkInCode!, language === "ar" ? "تم نسخ الكود" : "Code copied")}
                                  >
                                    <Copy className="me-2 h-4 w-4" />
                                    {language === "ar" ? "نسخ" : "Copy"}
                                  </Button>
                                )}
                              </div>

                              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/70 pt-4 sm:grid-cols-2">
                                <div className={cn("flex items-center gap-2 text-sm", language === "ar" && "flex-row-reverse justify-end text-right")}>
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate">{language === "ar" ? verificationResult.booking.courtName : verificationResult.booking.courtNameEn}</span>
                                </div>

                                <div className={cn("flex items-center gap-2 text-sm", language === "ar" && "flex-row-reverse justify-end text-right")}>
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate">{formatDate(new Date(`${verificationResult.booking.date}T00:00:00`))}</span>
                                </div>

                                <div className={cn("flex items-center gap-2 text-sm", language === "ar" && "flex-row-reverse justify-end text-right")}>
                                  <Banknote className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-bold text-primary">{formatMoneyEGP(verificationResult.booking.totalPrice || verificationResult.booking.amount || 0, language)}</span>
                                </div>

                                <div className={cn("flex items-center justify-between gap-2 text-sm sm:col-span-2", language === "ar" && "flex-row-reverse")}>
                                  <div className={cn("flex items-center gap-2", language === "ar" && "flex-row-reverse")}>
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-mono">{format12h(verificationResult.booking.startTime, language)} - {format12h(verificationResult.booking.endTime, language)}</span>
                                  </div>

                                  {!hasCheckInRecord(verificationResult.booking) ? (
                                    <Badge variant="outline" className="rounded-xl bg-warning/10 border-warning/30 text-warning">
                                      {getWindowInfo(verificationResult.booking).label}
                                    </Badge>
                                  ) : (
                                    <StatusBadge variant={getBookingStatusMeta(verificationResult.booking).variant} dot>
                                      {getBookingStatusMeta(verificationResult.booking).label}
                                    </StatusBadge>
                                  )}
                                </div>
                              </div>

                              {hasBookingNote(verificationResult.booking.notes) ? (
                                <BookingNotePanel
                                  note={verificationResult.booking.notes}
                                  language={language}
                                  className="mt-3 text-start"
                                />
                              ) : null}

                              <div className={cn("mt-3 flex flex-col gap-2 sm:flex-row", language === "ar" && "sm:flex-row-reverse")}>
                                <Button variant="outline" className="rounded-xl" onClick={() => openQuickPanel(verificationResult.booking!)}>
                                  <PanelRight className="me-2 h-4 w-4" />
                                  {language === "ar" ? "تفاصيل الحجز" : "Booking details"}
                                </Button>

                                <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => setActiveTab("bookings")}>
                                  <Eye className="me-2 h-4 w-4" />
                                  {language === "ar" ? "عرض في الحجوزات" : "View in bookings"}
                                </Button>
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </CardContent>
                  </Card>
              </div>
            </div>
          </TabsContent>

            {/* Bookings Tab */}
            <TabsContent value="bookings" className="space-y-6">
              <SoftSection
                rtl={isArabic}
                title={
                  isAdminMode
                    ? language === "ar"
                      ? "الحجوزات الفائتة"
                      : "Missed bookings"
                    : language === "ar"
                      ? "حجوزات اليوم"
                      : "Today's bookings"
                }
                description={
                  isAdminMode
                    ? language === "ar"
                      ? "مراجعة وتسجيل حضور الحجوزات الفائتة"
                      : "Review and check in missed bookings"
                    : language === "ar"
                      ? "بحث، فلترة، وتسجيل حضور سريع"
                      : "Search, filter, and check in quickly"
                }
              >
                {isLoadingBookings ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">{language === "ar" ? "جاري التحميل..." : "Loading bookings..."}</span>
                  </div>
                ) : (
                <>
                <div className="mb-2 space-y-3 md:hidden">
                  <div className="space-y-2">
                    <div className={cn("flex flex-wrap gap-2", language === "ar" && "justify-end")}>
                      <MiniPill active={filterStatus === "all"} onClick={() => setFilterStatus("all")}>
                        <Filter className="h-3.5 w-3.5" /> {language === "ar" ? "الكل" : "All"}
                      </MiniPill>
                      <MiniPill active={filterStatus === "pending"} onClick={() => setFilterStatus("pending")}>
                        <Clock className="h-3.5 w-3.5" /> {waitingToCheckInLabel}
                      </MiniPill>
                      <MiniPill active={filterStatus === "checked-in"} onClick={() => setFilterStatus("checked-in")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {language === "ar" ? "تم الحضور" : "Checked In"}
                      </MiniPill>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2">
                      <div className="relative col-span-2">
                        <Search className={cn("absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground", language === "ar" ? "right-3" : "left-3")} />
                        <Input
                          placeholder={language === "ar" ? "بحث..." : "Search..."}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={cn("rounded-2xl bg-background/60 backdrop-blur border-border/60", language === "ar" ? "pe-9 text-right" : "ps-9")}
                        />
                      </div>
                      <Select value={filterCourt} onValueChange={setFilterCourt}>
                        <SelectTrigger aria-label={language === "ar" ? "تصفية حسب الملعب" : "Filter by court"} className="w-full rounded-2xl bg-background/60 backdrop-blur border-border/60">
                          <SelectValue placeholder={language === "ar" ? "الملعب" : "Court"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{language === "ar" ? "كل الملاعب" : "All courts"}</SelectItem>
                          {courtOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filterTime} onValueChange={setFilterTime}>
                        <SelectTrigger aria-label={language === "ar" ? "تصفية حسب الوقت" : "Filter by time"} className="w-full rounded-2xl bg-background/60 backdrop-blur border-border/60">
                          <SelectValue placeholder={language === "ar" ? "الوقت" : "Time"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{language === "ar" ? "كل الأوقات" : "All times"}</SelectItem>
                          <SelectItem value="upcoming">{language === "ar" ? "قادم" : "Upcoming"}</SelectItem>
                          <SelectItem value="current">{language === "ar" ? "حالي" : "Current"}</SelectItem>
                          <SelectItem value="past">{language === "ar" ? "منتهي" : "Past"}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("")
                          setFilterCourt("all")
                          setFilterStatus("all")
                          setFilterTime("all")
                        }}
                        className="col-span-2 w-full rounded-2xl border-border/60 bg-background/60 backdrop-blur hover:bg-background/80"
                      >
                        {language === "ar" ? "إعادة ضبط" : "Reset"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="md:hidden space-y-3">
                  {pagedBookings.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      {language === "ar" ? "لا توجد حجوزات" : "No bookings found"}
                    </div>
                  ) : (
                    pagedBookings.map((booking) => {
                      const canNow = canRunCheckInAction(booking)
                      const statusMeta = getBookingStatusMeta(booking)

                      return (
                        <Card
                          key={booking.id}
                          className="rounded-2xl border border-border/60 bg-card cursor-pointer"
                          onClick={() => openQuickPanel(booking)}
                        >
                          <CardContent className="p-5 space-y-5">
                            <div className={cn("flex items-start gap-4", language === "ar" && "flex-row-reverse")}>
                              <Avatar className="h-12 w-12 ring-2 ring-border/30">
                                <AvatarImage src={getPlayerAvatar(booking)} />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl uppercase">{getPlayerName(booking).charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className={cn("min-w-0 flex-1 space-y-1", language === "ar" && "text-right")}>
                                <h4 className="font-bold text-lg leading-none tracking-tight text-foreground truncate">{getPlayerName(booking)}</h4>
                                <p className="text-sm text-muted-foreground font-medium truncate opacity-90">
                                  {language === "ar" ? booking.courtName : booking.courtNameEn}
                                </p>
                                <div className={cn("mt-2 flex flex-wrap items-center gap-2", language === "ar" && "justify-end")}>
                                  <StatusBadge variant={statusMeta.variant} dot className="h-6 px-2.5">
                                    {statusMeta.label}
                                  </StatusBadge>
                                  {columns.window ? windowBadgeFor(booking) : null}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className={cn("flex flex-col gap-1 rounded-2xl bg-muted/30 p-3 transition-colors hover:bg-muted/40", language === "ar" && "text-right")}>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                                  <Clock className="h-3 w-3" />
                                  {language === "ar" ? "الوقت" : "Time"}
                                </span>
                                <span className="font-mono text-xs font-black text-foreground">
                                  {format12h(booking.startTime, language)} - {format12h(booking.endTime, language)}
                                </span>
                              </div>
                              <div className={cn("flex flex-col gap-1 rounded-2xl bg-muted/30 p-3 transition-colors hover:bg-muted/40", language === "ar" && "text-right")}>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                                  <QrCode className="h-3 w-3" />
                                  {language === "ar" ? "الكود" : "Code"}
                                </span>
                                <div className={cn("flex items-center justify-between", language === "ar" && "flex-row-reverse")}>
                                  <span className="font-mono text-xs font-black tracking-widest text-foreground">
                                    {booking.checkInCode || "—"}
                                  </span>
                                  {booking.checkInCode ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        copyToClipboard(booking.checkInCode!, language === "ar" ? "تم نسخ الكود" : "Code copied")
                                      }}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : null}
                                </div>
                              </div>

                              {/* Price Block */}
                              <div className={cn("col-span-2 flex items-center justify-between rounded-2xl bg-primary/5 border border-primary/10 p-3 transition-colors hover:bg-primary/10", language === "ar" && "flex-row-reverse text-right")}>
                                <div className="flex items-center gap-2">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Banknote className="h-4 w-4" />
                                  </div>
                                  <span className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">
                                    {language === "ar" ? "إجمالي المبلغ" : "Total Amount"}
                                  </span>
                                </div>
                                <span className="text-lg font-black text-primary">
                                  {formatMoneyEGP(booking.totalPrice ?? booking.amount ?? 0, language)}
                                </span>
                              </div>
                            </div>


                            <div className={cn("flex items-center gap-2 pt-2", language === "ar" ? "flex-row-reverse" : "flex-row")}>
                              <div onClick={(e) => e.stopPropagation()}>
                                <BookingNotePopoverButton
                                  note={booking.notes}
                                  language={language}
                                  align={language === "ar" ? "start" : "end"}
                                  iconOnly
                                  className="h-10 w-10 shrink-0 rounded-2xl border-border/40 bg-background/50 backdrop-blur hover:bg-background/80"
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openQuickPanel(booking)
                                }}
                                className="flex-1 h-10 rounded-2xl border-border/40 bg-background/50 backdrop-blur hover:bg-background/80 font-semibold"
                              >
                                <PanelRight className="me-2 h-4 w-4" />
                                {language === "ar" ? "تفاصيل" : "Details"}
                              </Button>

                              {!hasCheckInRecord(booking) ? (
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleQuickCheckIn(booking.id)
                                  }}
                                  disabled={!canNow}
                                  className="flex-[1.5] h-10 rounded-2xl font-bold shadow-sm shadow-primary/20"
                                >
                                  <CheckCircle2 className="me-2 h-4 w-4" />
                                  {language === "ar" ? "تسجيل حضور" : "Check In"}
                                </Button>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>

                <div className={cn(
                  "hidden md:block mt-2 rounded-2xl border border-border/60 bg-background/40 backdrop-blur overflow-hidden relative group",
                  language === "ar" && "[&_th]:text-right [&_td]:text-right"
                )}>
                  {/* Subtle indicators for horizontal scroll */}
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background/40 to-transparent pointer-events-none z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background/40 to-transparent pointer-events-none z-10 opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-muted/10 hover:scrollbar-thumb-primary/50 transition-colors" dir={language === "ar" ? "rtl" : "ltr"}>
                    <Table className="min-w-[1400px] border-separate border-spacing-0">
                      <TableHeader className="bg-muted/25">
                        <TableRow className="hover:bg-transparent border-b border-border/40">
                          <TableHead colSpan={visibleColSpan} className="px-4 py-3 bg-muted/5 sticky left-0 z-20 border-r border-border/10">
                            <div className={cn("flex flex-wrap items-center gap-4 justify-between", language === "ar" && "flex-row-reverse")}>
                              <div className="flex flex-wrap gap-2">
                                <MiniPill active={filterStatus === "all"} onClick={() => setFilterStatus("all")}>
                                  <Filter className="h-3.5 w-3.5" /> {language === "ar" ? "الكل" : "All"}
                                </MiniPill>
                                <MiniPill active={filterStatus === "pending"} onClick={() => setFilterStatus("pending")}>
                                  <Clock className="h-3.5 w-3.5" /> {waitingToCheckInLabel}
                                </MiniPill>
                                <MiniPill active={filterStatus === "checked-in"} onClick={() => setFilterStatus("checked-in")}>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> {language === "ar" ? "تم الحضور" : "Checked In"}
                                </MiniPill>
                              </div>
                              <div className={cn("flex flex-wrap items-center gap-3", language === "ar" && "flex-row-reverse")}>
                                <div className="relative">
                                  <Search className={cn("absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground", language === "ar" ? "right-3" : "left-3")} />
                                  <Input
                                    placeholder={language === "ar" ? "بحث..." : "Search..."}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={cn("rounded-2xl bg-background/40 backdrop-blur-sm border-border/40 w-[240px] h-9 focus:bg-background/80 transition-all", language === "ar" ? "pe-9 text-right" : "ps-9")}
                                  />
                                </div>
                                <Select value={filterCourt} onValueChange={setFilterCourt}>
                                  <SelectTrigger aria-label={language === "ar" ? "تصفية حسب الملعب" : "Filter by court"} className="w-[190px] h-9 rounded-2xl bg-background/40 backdrop-blur-sm border-border/40 focus:bg-background/80 transition-all">
                                    <SelectValue placeholder={language === "ar" ? "الملعب" : "Court"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">{language === "ar" ? "كل الملاعب" : "All courts"}</SelectItem>
                                    {courtOptions.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select value={filterTime} onValueChange={setFilterTime}>
                                  <SelectTrigger aria-label={language === "ar" ? "تصفية حسب الوقت" : "Filter by time"} className="w-[160px] h-9 rounded-2xl bg-background/40 backdrop-blur-sm border-border/40 focus:bg-background/80 transition-all">
                                    <SelectValue placeholder={language === "ar" ? "الوقت" : "Time"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">{language === "ar" ? "كل الأوقات" : "All times"}</SelectItem>
                                    <SelectItem value="upcoming">{language === "ar" ? "قادم" : "Upcoming"}</SelectItem>
                                    <SelectItem value="current">{language === "ar" ? "حالي" : "Current"}</SelectItem>
                                    <SelectItem value="past">{language === "ar" ? "منتهي" : "Past"}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSearchQuery("")
                                    setFilterCourt("all")
                                    setFilterStatus("all")
                                    setFilterTime("all")
                                  }}
                                  className="h-9 rounded-2xl border-border/40 bg-background/40 backdrop-blur-sm hover:bg-background/80 transition-all"
                                >
                                  {language === "ar" ? "إعادة ضبط" : "Reset"}
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 rounded-2xl border-border/40 bg-background/40 backdrop-blur-sm hover:bg-background/80 transition-all"
                                    >
                                      <SlidersHorizontal className="me-2 h-4 w-4" />
                                      {language === "ar" ? "عرض" : "View"}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align={language === "ar" ? "end" : "start"} className="w-64">
                                    <DropdownMenuLabel>{language === "ar" ? "الإعدادات" : "Settings"}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center justify-between gap-3">
                                      <div className="space-y-0.5">
                                        <p className="text-sm font-medium">{language === "ar" ? "تحديث تلقائي" : "Auto refresh"}</p>
                                        <p className="text-xs text-muted-foreground">{language === "ar" ? "تحديث النافذة كل 30 ثانية" : "Refresh window badges every 30s"}</p>
                                      </div>
                                      <Switch aria-label={language === "ar" ? "تفعيل التحديث التلقائي" : "Toggle auto refresh"} checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>{language === "ar" ? "كثافة الصفوف" : "Row density"}</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as any)}>
                                      <DropdownMenuRadioItem value="comfortable">
                                        {language === "ar" ? "مريح" : "Comfortable"}
                                      </DropdownMenuRadioItem>
                                      <DropdownMenuRadioItem value="compact">
                                        {language === "ar" ? "مضغوط" : "Compact"}
                                      </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>{language === "ar" ? "أعمدة الجدول" : "Table columns"}</DropdownMenuLabel>
                                    <DropdownMenuGroup>
                                      {(
                                        [
                                          ["player", language === "ar" ? "اللاعب" : "Player"],
                                          ["court", language === "ar" ? "الملعب" : "Court"],
                                          ["time", language === "ar" ? "الوقت" : "Time"],
                                          ["code", language === "ar" ? "الكود" : "Code"],
                                          ["price", language === "ar" ? "السعر" : "Price"],
                                          ["status", language === "ar" ? "الحالة" : "Status"],
                                          ["window", language === "ar" ? "النافذة" : "Window"],
                                          ["actions", language === "ar" ? "إجراءات" : "Actions"],
                                        ] as const
                                      ).map(([key, label]) => (
                                        <DropdownMenuCheckboxItem
                                          key={key}
                                          checked={(columns as any)[key]}
                                          onCheckedChange={(v) => setColumns((c) => ({ ...c, [key]: !!v }))}
                                        >
                                          {label}
                                        </DropdownMenuCheckboxItem>
                                      ))}
                                    </DropdownMenuGroup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </TableHead>
                        </TableRow>
                        <TableRow className="hover:bg-transparent">
                          {renderBookingsTableHeaderCells()}
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {pagedBookings.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={visibleColSpan} className="text-center py-12 text-muted-foreground">
                              {language === "ar" ? "لا توجد حجوزات" : "No bookings found"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          pagedBookings.map((booking) => {
                            return (
                              <TableRow
                                key={booking.id}
                                className="transition-colors hover:bg-primary/5 cursor-pointer group/row"
                                onClick={() => openQuickPanel(booking)}
                              >
                                {renderBookingTableRowCells(booking)}
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    {language === "ar"
                      ? `عرض ${totalRows === 0 ? 0 : start + 1}-${Math.min(end, totalRows)} من ${totalRows}`
                      : `Showing ${totalRows === 0 ? 0 : start + 1}-${Math.min(end, totalRows)} of ${totalRows}`}
                  </div>

                  <div className="flex items-center gap-1">
                    {language === "ar" ? (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex(totalPages - 1)}
                          disabled={safePage >= totalPages - 1}
                          aria-label="Go to last page"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={safePage >= totalPages - 1}
                          aria-label="Go to next page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Badge variant="outline" className="rounded-xl bg-background/60 border-border/60">
                          {safePage + 1} / {totalPages}
                        </Badge>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                          disabled={safePage === 0}
                          aria-label="Go to previous page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex(0)}
                          disabled={safePage === 0}
                          aria-label="Go to first page"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex(0)}
                          disabled={safePage === 0}
                          aria-label="Go to first page"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                          disabled={safePage === 0}
                          aria-label="Go to previous page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Badge variant="outline" className="rounded-xl bg-background/60 border-border/60">
                          {safePage + 1} / {totalPages}
                        </Badge>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={safePage >= totalPages - 1}
                          aria-label="Go to next page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-2xl bg-transparent"
                          onClick={() => setPageIndex(totalPages - 1)}
                          disabled={safePage >= totalPages - 1}
                          aria-label="Go to last page"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                </>
                )}
              </SoftSection>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              <SoftSection
                rtl={isArabic}
                title={language === "ar" ? "سجل الحضور" : "Check-in History"}
                description={language === "ar" ? "عرض جميع عمليات تسجيل الحضور المكتملة لليوم" : "All completed attendance activity for today"}
                right={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={checkInHistory.length === 0}
                      onClick={() => downloadHistoryCSV()}
                      className="rounded-2xl border-border/60 bg-background/60 backdrop-blur hover:bg-background/80"
                    >
                      <Download className="me-2 h-4 w-4" />
                      {language === "ar" ? "تصدير CSV" : "Export CSV"}
                    </Button>

                    <Badge variant="outline" className="rounded-xl bg-background/60 border-border/60">
                      {checkInHistory.length} {language === "ar" ? "عملية" : "events"}
                    </Badge>
                  </div>
                }
              >
                {checkInHistory.length === 0 ? (
                  <div className="text-center py-14">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 border border-border/60">
                      <History className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-muted-foreground">{language === "ar" ? "لا يوجد سجل حتى الآن" : "No history yet"}</p>
                  </div>
                ) : (
                  <div className={cn("rounded-2xl border border-border/60 overflow-hidden bg-background/40 backdrop-blur", language === "ar" && "[&_th]:text-right [&_td]:text-right")}>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[760px]">
                        <TableHeader className="bg-muted/25">
                          <TableRow className="hover:bg-transparent">
                            {renderHistoryTableHeaderCells()}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checkInHistory.map((entry) => (
                            <TableRow key={entry.id} className="hover:bg-primary/5 transition-colors">
                              {renderHistoryRowCells(entry)}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </SoftSection>
            </TabsContent>
        </div>
      </Tabs>

      {/* QUICK PANEL */}
      <Dialog open={quickPanelOpen} onOpenChange={setQuickPanelOpen}>
        <DialogContent
          className={cn(
            "p-0 border bg-background max-h-none overflow-hidden",
            "fixed inset-x-0 bottom-0 top-auto h-[92dvh] w-[calc(100vw-1rem)] max-w-[420px] mx-auto translate-x-0 translate-y-0 rounded-t-3xl",
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:top-0 sm:h-[100dvh] sm:w-[520px] sm:max-w-[520px] sm:rounded-none sm:border-l sm:border-t-0",
          )}
          showCloseButton={false}
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          <DialogTitle className="sr-only">{language === "ar" ? "تفاصيل الحجز" : "Booking details"}</DialogTitle>
          <DialogDescription className="sr-only">
            {language === "ar" ? "تفاصيل وإجراءات للحجز المحدد" : "Details and actions for the selected booking"}
          </DialogDescription>

          <div className="h-full flex flex-col">
            <div className="sm:hidden px-4 pt-3">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-muted" />
            </div>

            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PanelRight className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{language === "ar" ? "تفاصيل الحجز" : "Booking details"}</p>
                  <p className="text-xs text-muted-foreground">{language === "ar" ? "معلومات اللاعب والحجز" : "Player and booking info"}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setQuickPanelOpen(false)} aria-label={language === "ar" ? "إغلاق اللوحة السريعة" : "Close quick panel"}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4 mx-auto max-w-[420px] sm:max-w-[520px] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
                {selectedBooking ? (
                  <>
                    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 ring-1 ring-border/60">
                          <AvatarImage src={getPlayerAvatar(selectedBooking)} />
                          <AvatarFallback className="bg-primary/15 text-primary font-bold text-lg uppercase">{getPlayerName(selectedBooking).charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{getPlayerName(selectedBooking)}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "ar" ? selectedBooking.courtName : selectedBooking.courtNameEn}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge variant={getBookingStatusMeta(selectedBooking).variant} dot>
                              {getBookingStatusMeta(selectedBooking).label}
                            </StatusBadge>
                            {!hasCheckInRecord(selectedBooking) ? (
                              <Badge variant="outline" className="rounded-xl bg-background/60 border-border/60">
                                {getWindowInfo(selectedBooking).label}
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="rounded-xl bg-primary/10 border-primary/20 text-primary font-bold">
                              <Banknote className="me-1 h-3 w-3" />
                              {formatMoneyEGP(selectedBooking.totalPrice ?? selectedBooking.amount ?? 0, language)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl border border-border/60 bg-background/60 p-2">
                          <p className="text-xs text-muted-foreground">{language === "ar" ? "التاريخ" : "Date"}</p>
                          <p className="font-medium text-xs">{formatDate(new Date(`${selectedBooking.date}T00:00:00`))}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/60 p-2">
                          <p className="text-xs text-muted-foreground">{language === "ar" ? "الوقت" : "Time"}</p>
                          <p className="font-mono text-xs">
                            {format12h(selectedBooking.startTime, language)} - {format12h(selectedBooking.endTime, language)}
                          </p>
                        </div>
                      </div>

                      {selectedBooking.checkInCode ? (
                        <div className="mt-3 rounded-xl border border-border/60 bg-background/60 p-3 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">{language === "ar" ? "كود الحضور" : "Check-in Code"}</p>
                            <p className="font-mono font-bold tracking-widest text-lg">{selectedBooking.checkInCode}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl bg-transparent"
                            onClick={() => copyToClipboard(selectedBooking.checkInCode!, language === "ar" ? "تم نسخ الكود" : "Code copied")}
                            aria-label={language === "ar" ? "نسخ الكود" : "Copy code"}
                          >
                            <Copy className="me-2 h-4 w-4" />
                            {language === "ar" ? "نسخ" : "Copy"}
                          </Button>
                        </div>
                      ) : null}

                      {hasBookingNote(selectedBooking.notes) ? (
                        <BookingNotePanel note={selectedBooking.notes} language={language} className="mt-3" />
                      ) : null}
                    </div>

                    {(() => {
                      const userPhone = (selectedBooking as any).userPhone
                      return userPhone ? (
                        <div className="rounded-2xl border border-border/60 bg-background/60 p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{language === "ar" ? "هاتف اللاعب" : "Player Phone"}</p>
                            <p className="font-medium truncate">{userPhone}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl bg-transparent"
                              onClick={() => copyToClipboard(userPhone, language === "ar" ? "تم نسخ الرقم" : "Phone copied")}
                            >
                              <Copy className="me-2 h-4 w-4" /> {language === "ar" ? "نسخ" : "Copy"}
                            </Button>
                          </div>
                        </div>
                      ) : null
                    })()}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {!hasCheckInRecord(selectedBooking) ? (
                        <Button className="rounded-2xl" onClick={() => handleQuickCheckIn(selectedBooking.id)} disabled={!canRunCheckInAction(selectedBooking)}>
                          <CheckCircle2 className="me-2 h-4 w-4" />
                          {language === "ar" ? "تسجيل حضور" : "Check In"}
                        </Button>
                      ) : (
                        <Badge variant="outline" className="justify-center rounded-2xl border-info/30 bg-info/10 px-3 py-3 text-info">
                          {language === "ar" ? "مكتمل" : "Completed"}
                        </Badge>
                      )}

                      <Button
                        variant="outline"
                        className="rounded-2xl bg-transparent"
                        onClick={() => {
                          if (selectedBooking.checkInCode) {
                            const normalizedCode = normalizeCheckInCode(selectedBooking.checkInCode)
                            setCode(normalizedCode)
                            handleVerify(normalizedCode)
                            setQuickPanelOpen(false)
                            setActiveTab("verify")
                          }
                        }}
                        disabled={!selectedBooking.checkInCode}
                      >
                        <Scan className="me-2 h-4 w-4" />
                        {language === "ar" ? "تحقق الآن" : "Verify now"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-14 text-muted-foreground">{language === "ar" ? "اختر حجزاً لعرض اللوحة" : "Select a booking to open the panel"}</div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border/60 flex items-center justify-between pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => setQuickPanelOpen(false)}>
                {language === "ar" ? "إغلاق" : "Close"}
              </Button>

              {selectedBooking && (
                <Badge variant="outline" className="rounded-xl bg-background/60 border-border/60">
                  <Banknote className="me-1 h-3 w-3" />
                  {formatMoneyEGP(selectedBooking.totalPrice ?? selectedBooking.amount ?? 0, language)}
                </Badge>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dropdown Check-in Confirmation Dialog ── */}
      <Dialog
        open={!!pendingCheckIn}
        onOpenChange={(open) => { 
          if (!open) {
            setPendingCheckIn(null)
            setSelectValue("")
            setVerifyInputKey(k => k + 1)
          }
        }}
      >
        <DialogContent
          dir={direction}
          className="rounded-[32px] w-[calc(100vw-2rem)] sm:max-w-md p-0 overflow-hidden border-border/40 shadow-xl"
        >
          {/* Unified modern card style */}
            <div className="bg-background px-6 pt-8 pb-5 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Scan className="h-8 w-8" />
              </div>
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-center text-foreground">
                  {isArabic ? "تأكيد الحضور" : "Confirm Check-in"}
                </DialogTitle>
                <DialogDescription className="sr-only">Confirm</DialogDescription>
              </DialogHeader>
            </div>
  
            {/* Booking details */}
              {pendingCheckIn && (
                <div className="px-5 pb-4">
                  <div className={cn("flex flex-col gap-4 rounded-[28px] border border-border/40 bg-muted/20 p-4", isArabic && "text-right")}>
                    <div className={cn("flex w-full items-center gap-3", isArabic && "flex-row-reverse")}>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background shadow-sm border border-border/40">
                        <Users className="h-5 w-5 text-foreground/80" />
                      </div>
                      <div className={cn("min-w-0 flex-1 text-left", isArabic && "text-right")}>
                        <p className="font-bold text-lg truncate text-foreground">{pendingCheckIn.playerName}</p>
                        <p className="text-xs font-medium text-muted-foreground truncate">{pendingCheckIn.courtName}</p>
                      </div>
                    </div>
    
                    <div className={cn("flex w-full justify-between items-center rounded-2xl bg-background border border-border/40 p-3.5 shadow-sm", isArabic && "flex-row-reverse")}>
                      <div className={cn("text-left", isArabic && "text-right")}>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{isArabic ? "الوقت" : "Time"}</p>
                        <p className="text-sm font-bold text-foreground" dir="ltr">{pendingCheckIn.timeLabel}</p>
                      </div>
                      <div className="h-8 w-px bg-border/40" />
                      <div className={cn("text-right", isArabic && "text-left")}>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{isArabic ? "المبلغ" : "Amount"}</p>
                        <p className="text-sm font-black text-emerald-500">{pendingCheckIn.priceLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Footer */}
          <div className={cn("px-6 pb-8 pt-4 flex gap-3", isArabic && "flex-row-reverse")}>
            <Button
              variant="outline"
              className="flex-1 h-14 rounded-full text-base font-bold bg-transparent border-border/60 hover:bg-muted/50 transition-colors"
              onClick={() => {
                setPendingCheckIn(null)
                setSelectValue("")
                setVerifyInputKey(k => k + 1)
              }}
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              className="flex-1 h-14 rounded-full text-base font-bold gap-2 shadow-md hover:-translate-y-0.5 transition-transform"
              onClick={() => {
                if (pendingCheckIn) {
                  setCode(pendingCheckIn.code)
                  handleVerify(pendingCheckIn.code)
                  setPendingCheckIn(null)
                }
              }}
            >
              <Scan className="h-5 w-5" />
              {isArabic ? "تأكيد الحضور" : "Confirm Check-in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
