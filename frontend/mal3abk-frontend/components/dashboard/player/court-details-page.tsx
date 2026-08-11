"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createBooking, createPaymobCheckoutSession, getPublicCourtAvailability, getFavorites, toggleFavorite as toggleFavoriteApi } from "@/lib/api"
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Heart,
  MapPin,
  Phone,
  Share2,
  Star,
  Users,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
  Crown,
  Flame,
  Zap,
  Wifi,
  Car,
  Coffee,
  Shield,
  Copy,
  Navigation,
  ExternalLink,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { cn } from "@/lib/utils"
import { sportTypes } from "@/lib/constants"
import {
  DEFAULT_PEAK_END_TIME,
  DEFAULT_PEAK_START_TIME,
  timeToMinutes,
  minutesToTime,
  checkNextDay,
  format12h,
  formatOperatingHours,
  isPeakHour,
  isStartTimeCoveredBySelection,
} from "@/lib/time"
import { createEgyptDate, getBookableStartDateForCourt, getBookingDateForCourtSlot, getCalendarDayDiffFromEgyptToday, getEgyptDateSequence } from "@/lib/date"
import { BOOKING_NOTE_MAX_LENGTH, toBookingNotePayload } from "@/lib/booking-notes"
import type { Court } from "@/lib/types"

interface CourtDetailsPageProps {
  court: Court
}

function todayISO() {
  // ✅ FIX: Force Cairo time to prevent midnight/timezone shifting bugs
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}



function getAmenityIcon(label: string) {
  const s = label.toLowerCase()
  if (s.includes("wifi") || s.includes("واي")) return Wifi
  if (s.includes("park") || s.includes("موقف")) return Car
  if (s.includes("cafe") || s.includes("coffee") || s.includes("كاف")) return Coffee
  if (s.includes("lock") || s.includes("خزن") || s.includes("locker")) return Shield
  return Sparkles
}

function translateUnavailableReason(reason: string | null | undefined, tr: (ar: string, en: string) => string) {
  if (!reason) return ""
  if (reason === "Already booked") return tr("هذا الموعد محجوز بالفعل", "This slot is already booked")
  if (reason === "This time has already started or passed") return tr("هذا الموعد بدأ بالفعل أو انتهى", "This time has already started or passed")
  return reason
}

function formatDateLabel(dateISO: string, language: "ar" | "en") {
  const diffDays = getCalendarDayDiffFromEgyptToday(dateISO)

  if (diffDays === 0) return language === "ar" ? "اليوم" : "Today"
  if (diffDays === 1) return language === "ar" ? "غداً" : "Tomorrow"

  try {
    const [year, month, day] = dateISO.split("-").map(Number)
    const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0))
    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "Africa/Cairo",
    }).format(date)
  } catch {
    return dateISO
  }
}

function buildMapsUrl(q: string) {
  // Always works without coords
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function buildMapsEmbedUrl(q: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md",
        className,
      )}
    >
      {children}
    </span>
  )
}

type DetailsTab = "about" | "amenities" | "pricing" | "location" | "policies"

function TabsPills({
  value,
  onChange,
  items,
  direction,
}: {
  value: DetailsTab
  onChange: (v: DetailsTab) => void
  items: { id: DetailsTab; ar: string; en: string }[]
  direction: "ltr" | "rtl"
}) {
  return (
    <div
      className="flex flex-wrap gap-2 pb-1 md:flex-nowrap md:overflow-x-auto md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden"
      dir={direction}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "inline-flex min-h-10 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center rounded-2xl border px-3 py-2 text-sm font-extrabold transition-all md:flex-none md:basis-auto md:shrink-0",
            value === it.id
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background/50 border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30",
          )}
        >
          {direction === "rtl" ? it.ar : it.en}
        </button>
      ))}
    </div>
  )
}

export function CourtDetailsPage({ court }: CourtDetailsPageProps) {
  const { language, t, direction = "ltr" } = useLanguage()
  const { user, refreshUser } = useAuth()
  const router = useRouter()

  const tr = useCallback((ar: string, en: string) => (language === "ar" ? ar : en), [language])

  const title = language === "ar" ? court.name : court.nameEn
  const city = language === "ar" ? court.city : court.cityEn
  const location = language === "ar" ? court.location : court.locationEn
  const desc = language === "ar" ? court.description : court.descriptionEn
  const sportData = sportTypes[court.sportType]
  const sportLabel = sportData ? (language === "ar" ? sportData.ar : sportData.en) : court.sportType

  const images = court.images?.length ? court.images : ["/placeholder.svg?height=700&width=1400&query=premium sports court"]

  // Gallery
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // Favorites
  const [isFavorite, setIsFavorite] = useState(false)

  // Details tabs (reduces page scroll)
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("about")

  // Booking dialog
  const [bookingOpen, setBookingOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [selectedTime, setSelectedTime] = useState("")
  const [selectionResetNotice, setSelectionResetNotice] = useState("")
  const [durationHours, setDurationHours] = useState<1 | 2 | 3>(1)
  const [timeFilter, setTimeFilter] = useState<"all" | "morning" | "afternoon" | "evening">("all")
  const [bookingNote, setBookingNote] = useState("")
  const bookingScrollRef = useRef<HTMLDivElement | null>(null)
  const bookingOpenedAtRef = useRef(0)

  const openTime = court.openTime ?? "08:00"
  const closeTime = court.closeTime ?? "23:00"
  const bookableStartDate = getBookableStartDateForCourt(court)
  const offPeakPrice = court.offPeakPrice ?? 0
  const peakPrice = court.peakPrice ?? offPeakPrice
  const peakStartTime = court.peakStartTime ?? DEFAULT_PEAK_START_TIME
  const peakEndTime = court.peakEndTime ?? DEFAULT_PEAK_END_TIME
  const peakWindowLabel = `${format12h(peakStartTime, language)} - ${format12h(peakEndTime, language)}`
  const offPeakWindowLabel = `${format12h(peakEndTime, language)} - ${format12h(peakStartTime, language)}`
  const hasVariablePricing = peakPrice !== offPeakPrice


  const premium = (court.rating ?? 0) >= 4.8
  const hot = (court.totalBookings ?? 0) >= 1200

  const [availableToday, setAvailableToday] = useState<boolean | null>(null)
  const availableTodayLabel =
    availableToday === null
      ? tr("جاري التحقق", "Checking today")
      : availableToday
        ? tr("متاح اليوم", "Available today")
        : tr("ضغط عالي", "Limited")

  // Fetch real availability for the Hero badge on mount
  useEffect(() => {
    let cancelled = false
    setAvailableToday(null)
    // Use the new API endpoint instead of getBookedSlots
    getPublicCourtAvailability(court.id, { date: bookableStartDate, slotMinutes: 60 })
      .then((res: any) => {
        if (!cancelled) {
          // If at least one slot is available today, mark it as available
          const hasAvailable = (res.slots || []).some((s: any) => s.available)
          setAvailableToday(hasAvailable)
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableToday(false)
      })
    return () => {
      cancelled = true
    }
  }, [court.id, bookableStartDate])

  /* ----------------------------- real favorites ----------------------------- */
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const loadFavs = async () => {
      try {
        const res = await getFavorites()
        if (!cancelled && res.items) {
          setIsFavorite(!!res.items.find((c: any) => c.id === court.id))
        }
      } catch (e) {
        console.error("Failed to load favorites", e)
      }
    }
    loadFavs()
    return () => { cancelled = true }
  }, [court.id, user])

  const toggleFavorite = async () => {
    if (!user) {
      toast.error(tr("يجب تسجيل الدخول أولاً", "You must log in first"))
      return
    }

    // Optimistic UI update
    setIsFavorite((v) => !v)

    try {
      const res = await toggleFavoriteApi(court.id)
      setIsFavorite(res.favorited)
      toast.success(
        res.favorited ? tr("تمت الإضافة للمفضلة", "Added to favorites") : tr("تم الحذف من المفضلة", "Removed from favorites"),
      )
    } catch (e: any) {
      // Revert optimistic update on failure
      setIsFavorite((v) => !v)
      toast.error(e?.message || tr("حدث خطأ", "An error occurred"))
    }
  }

  const selectedEndTime = useMemo(() => {
    if (!selectedTime) return ""
    const end = timeToMinutes(selectedTime) + durationHours * 60
    return minutesToTime(end)
  }, [selectedTime, durationHours])

  const durationFitsCourtHours = useMemo(() => {
    if (!selectedTime) return true
    const openM = timeToMinutes(court.openTime ?? "08:00")
    let closeM = timeToMinutes(court.closeTime ?? "23:00")
    if (closeM < openM || closeM === openM) closeM += 1440

    let startM = timeToMinutes(selectedTime)
    // If selectedTime is "before" openM numerically but within the overnight window, shift it
    if (startM < openM && (startM + 1440) <= closeM) {
      startM += 1440
    }

    const endM = startM + durationHours * 60
    return endM <= closeM
  }, [selectedTime, court.openTime, court.closeTime, durationHours])

  // ---- Real availability from backend ----
  const [apiSlots, setApiSlots] = useState<{date?: string, start: string, end: string, available: boolean, closureReason?: string | null, unavailableReason?: string | null}[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    if (!bookingOpen || !selectedDate) {
      setApiSlots([])
      setLoadingSlots(false)
      if (!selectedDate) {
        setSelectedTime("")
      }
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    
    // Fetch normalized slots directly from the backend
    getPublicCourtAvailability(court.id, { date: selectedDate, slotMinutes: durationHours * 60 })
      .then((res: any) => {
        if (!cancelled) setApiSlots(res.slots || [])
      })
      .catch(() => {
        if (!cancelled) setApiSlots([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false)
      })
    return () => { cancelled = true }
  }, [bookingOpen, court.id, selectedDate, durationHours])

  const selectionOk = useMemo(() => {
    if (!selectedDate || !selectedTime) return { ok: false, msg: "" }
    const slot = apiSlots.find((s) => s.start === selectedTime)

    if (slot?.available) {
      return { ok: true, msg: tr("الموعد متاح ✅ سيتم تأكيد الحجز مع كود دخول", "Available ✅ Booking will be confirmed with an entry code") }
    }
    return { ok: false, msg: translateUnavailableReason(slot?.unavailableReason || slot?.closureReason, tr) || tr("هذا الموعد غير متاح", "This slot is not available") }
  }, [selectedDate, selectedTime, apiSlots, tr])

  // Price varies by hour (peak/offpeak) => sum per hour
  const computeTotalPrice = useCallback((court: Court, startTime: string, durationH: number) => {
    const off = court.offPeakPrice ?? 0
    const peak = court.peakPrice ?? off
    const startM = timeToMinutes(startTime)
    let total = 0
    for (let i = 0; i < durationH; i++) {
      const t24 = minutesToTime(startM + i * 60)
      total += isPeakHour(t24, court.peakStartTime, court.peakEndTime) ? peak : off
    }
    return total
  }, [])

  const totalPrice = useMemo(() => {
    if (!court || !selectedTime) return 0
    return computeTotalPrice(court, selectedTime, durationHours)
  }, [court, selectedTime, durationHours, computeTotalPrice])

  const priceBreakdown = useMemo(() => {
    if (!court || !selectedTime) return []
    const off = court.offPeakPrice ?? 0
    const peak = court.peakPrice ?? off
    const startM = timeToMinutes(selectedTime)
    return Array.from({ length: durationHours }).map((_, i) => {
      const t24 = minutesToTime(startM + i * 60)
      const t12 = format12h(t24, language)
      const isPeak = isPeakHour(t24, court.peakStartTime, court.peakEndTime)
      return { time: t24, timeLabel: t12, isPeak, amount: isPeak ? peak : off }
    })
  }, [court, selectedTime, durationHours, language])

  // preserve booking selections when the sheet closes; only seed a default date on first open
  useEffect(() => {
    if (bookingOpen && (!selectedDate || selectedDate < bookableStartDate)) {
      setSelectedDate(bookableStartDate)
      setSelectedTime("")
    }
  }, [bookingOpen, selectedDate, bookableStartDate])



  // keep selected time valid when date/duration changes
  useEffect(() => {
    if (!selectedDate || !selectedTime || loadingSlots) return
    const slot = apiSlots.find((s) => s.start === selectedTime)
    if (!slot?.available) {
      const timeLabel = format12h(selectedTime, language)
      const reason = translateUnavailableReason(slot?.unavailableReason || slot?.closureReason, tr)
      const message = tr(
        `${timeLabel} تم إلغاء اختياره لأنه لم يعد متاحاً للمدة المحددة${reason ? `: ${reason}` : "."}`,
        `${timeLabel} was cleared because it is no longer available for the selected duration${reason ? `: ${reason}` : "."}`,
      )
      setSelectedTime("")
      setSelectionResetNotice(message)
      toast.info(message)
    }
  }, [selectedDate, selectedTime, apiSlots, loadingSlots, language, tr])

  useEffect(() => {
    if (selectedTime) {
      setSelectionResetNotice("")
    }
  }, [selectedTime])

  useEffect(() => {
    if (!bookingOpen) {
      setSelectionResetNotice("")
      setBookingNote("")
    }
  }, [bookingOpen])

  const resetBookingDialogScroll = useCallback(() => {
    const body = bookingScrollRef.current
    if (!body) return
    body.scrollTop = 0
    body.scrollLeft = 0
  }, [])

  useEffect(() => {
    if (!bookingOpen) {
      bookingOpenedAtRef.current = 0
      return
    }

    bookingOpenedAtRef.current = Date.now()
    resetBookingDialogScroll()

    const frame = window.requestAnimationFrame(resetBookingDialogScroll)
    const timer = window.setTimeout(resetBookingDialogScroll, 250)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [bookingOpen, resetBookingDialogScroll])

  useEffect(() => {
    if (!bookingOpen || loadingSlots || !bookingOpenedAtRef.current) return
    if (Date.now() - bookingOpenedAtRef.current > 2500) return

    const timer = window.setTimeout(resetBookingDialogScroll, 80)
    return () => window.clearTimeout(timer)
  }, [apiSlots.length, bookingOpen, loadingSlots, resetBookingDialogScroll])

  // filter time slots by morning/afternoon/evening
  const filteredTimeSlots = useMemo(() => {
    if (!selectedDate) return []
    return apiSlots.filter((slot) => {
      const hh = Number.parseInt(slot.start, 10)
      const bucket = hh < 12 ? "morning" : hh < 16 ? "afternoon" : "evening"
      if (timeFilter === "all") return true
      return bucket === timeFilter
    })
  }, [apiSlots, timeFilter, selectedDate])
  const visibleTimeSlots = useMemo(() => {
    let slots = filteredTimeSlots

    if (!selectedTime || durationHours <= 1) return slots

    return slots.filter(
      (slot) => !isStartTimeCoveredBySelection(slot.start, selectedTime, durationHours, openTime),
    )
  }, [filteredTimeSlots, selectedTime, durationHours, openTime])
  // --- UI & Interaction Functions ---
  const startingPrice = Math.min(offPeakPrice, peakPrice)
  const mapQuery = useMemo(() => {
    if (typeof court.latitude === "number" && typeof court.longitude === "number") {
      return `${court.latitude},${court.longitude}`
    }
    return location || city || title
  }, [court.latitude, court.longitude, location, city, title])
  const mapsEmbedUrl = useMemo(() => buildMapsEmbedUrl(mapQuery), [mapQuery])

  const tabItems: { id: DetailsTab; ar: string; en: string }[] = [
    { id: "about", ar: "عن الملعب", en: "About" },
    { id: "amenities", ar: "المرافق", en: "Amenities" },
    { id: "pricing", ar: "الأسعار", en: "Pricing" },
    { id: "location", ar: "الموقع", en: "Location" },
    { id: "policies", ar: "السياسات", en: "Policies" },
  ]

  const shareOrCopy = () => {
    if (navigator.share) {
      navigator.share({ title, text: desc || "", url: window.location.href }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      toast.success(tr("تم نسخ الرابط", "Link copied"))
    }
  }

  const handleCall = () => {
    toast.success(tr("جاري الاتصال بالمدير...", "Calling manager..."))
  }

  const openMaps = () => {
    if (typeof court.latitude === "number" && typeof court.longitude === "number") {
      window.open(`https://www.google.com/maps?q=${court.latitude},${court.longitude}`, "_blank")
      return
    }
    const q = location || city || title
    window.open(buildMapsUrl(q), "_blank")
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(location || city || "")
    toast.success(tr("تم نسخ العنوان", "Address copied"))
  }

 const handleConfirmBooking = async () => {
    if (!user) {
      toast.error(tr("يجب تسجيل الدخول أولاً", "You must log in first"))
      router.push(`/auth/login?redirect=/dashboard/player/browse/${court.id}`)
      return
    }

    if (isSubmitting) return; // ✅ Prevent double clicks
    setIsSubmitting(true);    // ✅ Set loading state

    try {
      const selectedSlot = apiSlots.find((slot) => slot.start === selectedTime)
      const bookingDate = selectedSlot?.date || getBookingDateForCourtSlot(selectedDate, selectedTime, court)
      await createBooking({
        courtId: court.id,
        date: bookingDate,
        startTime: selectedTime,
        endTime: selectedEndTime,
        notes: toBookingNotePayload(bookingNote),
      })
      toast.success(tr("تم الحجز بنجاح! راجع صفحة حجوزاتي.", "Booking confirmed! Check My Bookings."))
      
      // Micro-interactions: Confetti & Haptic Feedback
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100])
      }
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#0d47a1', '#ffffff', '#ffd700'],
          zIndex: 9999
        })
      })

      await refreshUser().catch(() => null)
      router.refresh()
      setBookingOpen(false)
      router.push("/dashboard/player/bookings")
    } catch (e: any) {
      toast.error(e?.message || tr("حدث خطأ أثناء الحجز", "Booking failed"))
    } finally {
      setIsSubmitting(false); // ✅ Reset loading state
    }
  }

  const handlePaymobPay = async () => {
    if (!user) {
      toast.error(tr("يجب تسجيل الدخول أولاً", "You must log in first"))
      router.push(`/auth/login?redirect=/dashboard/player/browse/${court.id}`)
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const selectedSlot = apiSlots.find((slot) => slot.start === selectedTime)
      const bookingDate = selectedSlot?.date || getBookingDateForCourtSlot(selectedDate, selectedTime, court)
      
      const sessionData = await createPaymobCheckoutSession({
        courtId: court.id,
        date: bookingDate,
        startTime: selectedTime,
        endTime: selectedEndTime,
        notes: toBookingNotePayload(bookingNote) ?? undefined,
        paymentMethodType: "card",
      })

      toast.loading(tr("جاري التحويل لصفحة باي موب...", "Redirecting to Paymob..."))
      window.location.href = sessionData.checkoutUrl
    } catch (e: any) {
      toast.error(e?.message || tr("فشل بدء عملية الدفع عبر باي موب", "Paymob payment initiation failed"))
      setIsSubmitting(false)
    }
  }
  return (
    <div className={cn("min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-10", direction === "rtl" ? "rtl" : "ltr")} dir={direction}>

      {/* TOP BAR */}
      <div className="sticky top-[76px] z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="container-responsive h-13 px-4 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 -ms-2 text-muted-foreground hover:text-foreground">
            <Link href="/dashboard/player/browse">
              {language === "ar" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              {tr("العودة", "Back")}
            </Link>
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={shareOrCopy} className="h-9 w-9 rounded-full">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleFavorite} className="h-9 w-9 rounded-full">
              <Heart className={cn("h-4 w-4 transition-colors", isFavorite && "fill-red-500 text-red-500")} />
            </Button>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM CTA */}
      <div className="fixed start-3 end-[5.25rem] bottom-[calc(var(--mobile-bottom-nav-offset,0.75rem)+env(safe-area-inset-bottom))] z-[45] md:hidden flex min-h-16 items-center gap-3 rounded-[1.6rem] border border-border/60 bg-background/96 px-3.5 py-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.20)] backdrop-blur-xl transition-[bottom,transform,box-shadow] duration-300 ease-out">
        <div className="min-w-0 flex-1 ps-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("يبدأ من", "From")}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-extrabold leading-none">
            <span className="text-xl text-primary">{startingPrice}</span>
            <span className="text-xs font-bold text-muted-foreground">{tr("ج.م/ساعة", "EGP/hr")}</span>
          </p>
        </div>
        <Button
          onClick={() => { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([30]); setBookingOpen(true) }}
          className="h-12 shrink-0 rounded-[1.2rem] px-4 shadow-[0_10px_24px_hsl(var(--primary)/0.28)] gap-2 text-sm font-extrabold"
        >
          <Calendar className="h-4 w-4" />
          {tr("احجز الآن", "Book Now")}
        </Button>
      </div>

      <div className="container-responsive py-6 space-y-5">

        {/* HERO GRID */}
        <div className="grid gap-5 lg:grid-cols-12">

          {/* Gallery */}
          <div className="lg:col-span-8 space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-muted aspect-video group">
              <Image
                src={images[currentImageIndex]}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 66vw"
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAFBhaW50Lk5FVCB2My41LjbQg61aAAAADUlEQVQYV2OosbO/BwAErQKejMxykQAAAABJRU5ErkJggg=="
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

              {/* Badges top-left */}
              <div className="absolute top-3 start-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                  {sportLabel}
                </span>
                {premium && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
                    <Crown className="h-3 w-3" />{tr("مميز", "Premium")}
                  </span>
                )}
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  availableToday ? "bg-green-500/90 text-white" : "bg-black/50 text-white"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", availableToday === null ? "bg-white/60 animate-pulse" : availableToday ? "bg-white" : "bg-amber-400")} />
                  {availableTodayLabel}
                </span>
              </div>

              {/* Title bottom-left */}
              <div className="absolute bottom-3 start-3 end-16 min-w-0">
                <h1 className="text-xl md:text-2xl font-extrabold text-white drop-shadow-sm truncate">{title}</h1>
                {location && (
                  <p className="text-white/75 text-xs mt-0.5 flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />{location}
                  </p>
                )}
              </div>

              {/* Image counter */}
              <div className="absolute bottom-3 end-3 rounded-full bg-black/50 px-2.5 py-1 text-white text-xs font-semibold">
                {currentImageIndex + 1}/{images.length}
              </div>

              {/* Nav arrows desktop */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImageIndex(p => (p - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 text-white hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center hover:bg-black/60"
                  ><ChevronLeft className="h-4 w-4" /></button>
                  <button
                    onClick={() => setCurrentImageIndex(p => (p + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 text-white hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center hover:bg-black/60"
                  ><ChevronRight className="h-4 w-4" /></button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {images.slice(0, 8).map((src, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={cn(
                      "relative h-14 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition-colors",
                      idx === currentImageIndex ? "border-primary" : "border-transparent hover:border-border"
                    )}
                  >
                    <Image src={src} alt={title} fill className="object-cover" sizes="80px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop side card */}
          <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 h-fit">
            <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              {/* Price */}
              <div>
                <p className="text-xs text-muted-foreground">{tr("يبدأ من", "Starting from")}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-3xl font-extrabold text-primary">{startingPrice}</span>
                  <span className="text-sm text-muted-foreground">{tr("ج.م / ساعة", "EGP / hr")}</span>
                </div>
                {hasVariablePricing && (
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-500" />
                    {tr("سعر الذروة", "Peak pricing")} <span dir="ltr">{peakWindowLabel}</span>
                  </p>
                )}
              </div>

              <div className="h-px bg-border/50" />

              {/* Info rows */}
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{tr("ساعات العمل", "Hours")}</span>
                  <span className="font-semibold" dir="ltr">{formatOperatingHours(openTime, closeTime, language)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{tr("المدينة", "City")}</span>
                  <span className="font-semibold">{city}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{tr("التوافر", "Today")}</span>
                  <span className={cn("font-semibold text-xs", availableToday ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>{availableTodayLabel}</span>
                </div>
              </div>

              <Button
                onClick={() => { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([30]); setBookingOpen(true) }}
                className="w-full h-11 rounded-2xl font-bold gap-2"
              >
                <Calendar className="h-4 w-4" />
                {tr("احجز الآن", "Book Now")}
              </Button>

              {/* Quick actions */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={shareOrCopy} className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground">
                  <Share2 className="h-4 w-4" />{tr("مشاركة", "Share")}
                </button>
                <button onClick={openMaps} className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground">
                  <Navigation className="h-4 w-4" />{tr("خرائط", "Maps")}
                </button>
                <button onClick={copyAddress} className="flex flex-col items-center gap-1 py-2.5 rounded-xl border border-border/60 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground">
                  <Copy className="h-4 w-4" />{tr("نسخ", "Copy")}
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {tr("حجز فوري ✓ كود دخول من 8 رموز في حجوزاتي", "Instant booking ✓ 8-char entry code in My Bookings")}
              </p>
            </div>
          </div>
        </div>

        {/* DETAILS TABS */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          {/* Tab bar */}
          <div className="border-b border-border/60 px-4 pt-4 pb-0">
            <TabsPills value={detailsTab} onChange={setDetailsTab} items={tabItems} direction={direction} />
          </div>

          {/* Tab content */}
          <div className="p-4 sm:p-5">

            {/* ABOUT */}
            {detailsTab === "about" && (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-1">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tr("عن الملعب", "About")}</h2>
                  <p className="text-sm leading-relaxed text-foreground/80">{desc || tr("لا يوجد وصف.", "No description available.")}</p>
                </div>
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tr("معلومات", "Info")}</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">{tr("المدينة", "City")}</span><span className="font-medium">{city}</span></div>
                    {location && <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">{tr("العنوان", "Address")}</span><span className="font-medium truncate text-end">{location}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">{tr("ساعات العمل", "Hours")}</span><span className="font-medium" dir="ltr">{formatOperatingHours(openTime, closeTime, language)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{tr("الرياضة", "Sport")}</span><span className="font-medium">{sportLabel}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* AMENITIES */}
            {detailsTab === "amenities" && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tr("المرافق المتاحة", "Available Amenities")}</h2>
                {court.amenities?.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {court.amenities.map((amenity, i) => {
                      const label = language === "ar" ? amenity : court.amenitiesEn?.[i] ?? amenity
                      const Icon = getAmenityIcon(label)
                      return (
                        <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                          <span className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium">{label}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{tr("لا توجد بيانات مرافق.", "No amenities listed.")}</p>
                )}
              </div>
            )}

            {/* PRICING */}
            {detailsTab === "pricing" && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tr("الأسعار", "Pricing")}</h2>
                {hasVariablePricing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Clock className="h-4 w-4" />{tr("ساعات عادية", "Off-peak")}
                      </div>
                      <p className="text-2xl font-extrabold">{offPeakPrice} <span className="text-sm font-normal text-muted-foreground">{tr("ج.م/ساعة", "EGP/hr")}</span></p>
                      <p className="text-xs text-muted-foreground mt-1" dir="ltr">{offPeakWindowLabel}</p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
                      <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 mb-2">
                        <Zap className="h-4 w-4" />{tr("ساعات الذروة", "Peak hours")}
                      </div>
                      <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{peakPrice} <span className="text-sm font-normal">{tr("ج.م/ساعة", "EGP/hr")}</span></p>
                      <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1" dir="ltr">{peakWindowLabel}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Clock className="h-4 w-4" />{tr("سعر ثابت", "Flat rate")}</div>
                    <p className="text-2xl font-extrabold">{offPeakPrice} <span className="text-sm font-normal text-muted-foreground">{tr("ج.م/ساعة", "EGP/hr")}</span></p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {hasVariablePricing
                    ? tr("السعر الكلي يعتمد على وقت البداية والمدة.", "Final price depends on start time and duration.")
                    : tr("نفس السعر طوال اليوم.", "Same rate all day.")}
                </p>
              </div>
            )}

            {/* LOCATION */}
            {detailsTab === "location" && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tr("الموقع", "Location")}</h2>
                <div className="relative min-h-[220px] overflow-hidden rounded-xl border border-border/60 bg-muted">
                  <iframe
                    title={tr("خريطة موقع الملعب", "Court location map")}
                    src={mapsEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="absolute inset-0 h-full w-full border-0"
                  />
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-muted/20">
                  <MapPin className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">{city}</p>
                    {location && <p className="text-sm text-muted-foreground mt-0.5">{location}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={openMaps} className="flex-1 rounded-xl gap-2 bg-transparent">
                    <Navigation className="h-4 w-4" />{tr("فتح الخرائط", "Open Maps")}
                  </Button>
                  <Button variant="outline" onClick={copyAddress} className="flex-1 rounded-xl gap-2 bg-transparent">
                    <Copy className="h-4 w-4" />{tr("نسخ العنوان", "Copy Address")}
                  </Button>
                </div>
              </div>
            )}

            {/* POLICIES */}
            {detailsTab === "policies" && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tr("السياسات", "Policies")}</h2>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{tr("الحجز يُؤكد فوراً وتحصل على كود دخول من 8 رموز.", "Booking is confirmed instantly with an 8-character entry code.")}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{tr("يمكنك مراجعة حجوزاتك وأكواد الدخول من صفحة (حجوزاتي).", "View and manage bookings and entry codes in My Bookings.")}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <span>{tr("سياسات الإلغاء تعتمد على سياسة الملعب.", "Cancellation policy depends on the venue.")}</span>
                  </li>
                </ul>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* BOOKING DIALOG (ENHANCED — matches browse-courts-page design) */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            resetBookingDialogScroll()
          }}
          className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-xl"
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-xl font-extrabold">{tr("حجز ملعب", "Book court")}</DialogTitle>
            <DialogDescription className="sr-only">{tr("اختر تاريخ ووقت الحجز لهذا الملعب", "Choose a booking date and time for this court")}</DialogDescription>
          </DialogHeader>

          <div
            ref={bookingScrollRef}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 pb-24 scroll-pb-28 touch-pan-y [overflow-anchor:none] sm:px-5 sm:pb-6"
          >
            {/* Court info strip */}
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-xl shrink-0">
                <Image src={images[0]} alt={title} fill className="object-cover" sizes="48px" />
              </div>
              <div className="min-w-0">
                <p className="font-bold truncate text-sm">{title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {city} &bull; {formatOperatingHours(openTime, closeTime, language)}
                </p>
              </div>
              <Badge className="ms-auto shrink-0 bg-primary/10 text-primary border-0 text-xs">
                {sportLabel}
              </Badge>
            </div>

            <div className="h-px bg-border/50" />

            {/* Select Date — single calendar popover */}
            <div className="space-y-2">
              <Label
                htmlFor="court-details-date-trigger"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                {tr("اختر التاريخ", "Select Date")}
              </Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    id="court-details-date-trigger"
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-start"
                  >
                    <Calendar className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 text-sm font-medium">
                      {selectedDate
                        ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : tr("اختر تاريخاً...", "Pick a date...")}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl border border-border/60" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={selectedDate ? new Date(selectedDate + 'T12:00:00') : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const y = date.getFullYear()
                        const m = String(date.getMonth() + 1).padStart(2, '0')
                        const d = String(date.getDate()).padStart(2, '0')
                        setSelectedDate(`${y}-${m}-${d}`)
                        setSelectedTime("")
                        setDatePickerOpen(false)
                      }
                    }}
                    disabled={(date) => {
                      const minDate = new Date(bookableStartDate + 'T12:00:00')
                      minDate.setHours(0, 0, 0, 0)
                      return date < minDate
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {tr("المدة", "Duration")}
              </p>
              <div className="flex p-1 bg-muted/30 rounded-2xl border border-border/40">
                {[1, 2, 3].map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={cn(
                      "flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors",
                      durationHours === h
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setDurationHours(h as 1 | 2 | 3)}
                  >
                    {tr(`${h} ساعة`, `${h}h`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Slots */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {tr("وقت البداية", "Start Time")}
              </p>

              {!selectedDate ? (
                <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  {tr("اختر تاريخاً أولاً", "Pick a date first")}
                </div>
              ) : (
                <div className="space-y-2">
                  {apiSlots.some((slot) => slot.closureReason) && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <p>{tr("بعض الأوقات مغلقة", "Some slots are closed")} — <strong>{apiSlots.find(s => s.closureReason)?.closureReason}</strong></p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 [overflow-anchor:none] min-[340px]:grid-cols-3">
                    {visibleTimeSlots.map((slot: any) => {
                      const peak = hasVariablePricing && isPeakHour(slot.start, court.peakStartTime, court.peakEndTime)
                      const isSelected = selectedTime === slot.start
                      const unavailableLabel = translateUnavailableReason(slot.unavailableReason || slot.closureReason, tr)
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={!slot.available}
                          aria-disabled={!slot.available}
                          title={unavailableLabel || undefined}
                          onClick={() => {
                            if (!slot.available) {
                              toast.error(translateUnavailableReason(slot.unavailableReason || slot.closureReason, tr) || tr("هذا الموعد غير متاح", "This slot is not available"))
                              return
                            }
                            setSelectionResetNotice("")
                            setSelectedTime(slot.start)
                          }}
                          className={cn(
                            "relative flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-bold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-100",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : slot.available
                                ? "border-border/60 bg-background text-foreground hover:border-primary/50 hover:bg-primary/5 dark:border-white/15 dark:bg-white/[0.03]"
                                : "border-border/60 bg-muted/40 text-muted-foreground line-through decoration-2 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/55"
                          )}
                        >
                          <span dir="ltr">{format12h(slot.start, language)}</span>
                          {peak && <Zap className="h-3 w-3 shrink-0 text-amber-400" />}
                        </button>
                      )
                    })}
                  </div>

                  {loadingSlots && (
                    <p className="text-center text-xs text-muted-foreground py-2">
                      {tr("جارٍ تحميل الأوقات المتاحة...", "Loading available times...")}
                    </p>
                  )}

                  {!loadingSlots && visibleTimeSlots.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-2">
                      {tr("لا توجد أوقات متاحة ضمن هذا الفلتر.", "No time slots for this filter.")}
                    </p>
                  )}

                  {selectionResetNotice && !selectedTime && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{selectionResetNotice}</p>
                  )}
                </div>
              )}
            </div>

            {/* Note to Venue */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="court-details-booking-note" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {tr("ملاحظة للملعب", "Note to Venue")}
                </Label>
                <span className="text-xs text-muted-foreground">{bookingNote.length}/{BOOKING_NOTE_MAX_LENGTH}</span>
              </div>
              <Textarea
                id="court-details-booking-note"
                rows={2}
                maxLength={BOOKING_NOTE_MAX_LENGTH}
                value={bookingNote}
                onChange={(event) => setBookingNote(event.target.value)}
                className="rounded-2xl resize-none bg-muted/20 border-border/50 text-sm placeholder:text-muted-foreground/50"
                placeholder={tr("ملاحظة اختيارية للمدير...", "Optional note for the venue manager...")}
              />
            </div>

            {/* Price summary — only visible when a time is selected */}
            {selectedTime && (
              <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span>{tr("من", "From")} </span>
                  <span className="font-bold text-foreground" dir="ltr">{format12h(selectedTime, language)}</span>
                  <span> {tr("حتى", "to")} </span>
                  <span className="font-bold text-foreground" dir="ltr">{format12h(selectedEndTime, language)}</span>
                </div>
                <span className="text-xl font-extrabold text-primary">{totalPrice} <span className="text-xs font-semibold">{t("common.egp") ?? "EGP"}</span></span>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_-12px_28px_rgba(0,0,0,0.42)] sm:px-6 sm:pb-6 sm:pt-4 flex-col sm:flex-row">
            <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => setBookingOpen(false)}>
              {t("common.cancel") ?? tr("إلغاء", "Cancel")}
            </Button>

            <Button
              className="rounded-2xl flex-1 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 hover:scale-[1.02] shadow-lg shadow-emerald-500/20 active:scale-95"
              onClick={handlePaymobPay}
              disabled={!selectedDate || !selectedTime || !durationFitsCourtHours || !selectionOk.ok || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {tr("ادفع أونلاين بـ Paymob", "Pay Online with Paymob")}
            </Button>

            <Button
              variant="secondary"
              className="rounded-2xl gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-95"
              onClick={handleConfirmBooking}
              disabled={!selectedDate || !selectedTime || !durationFitsCourtHours || !selectionOk.ok || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {tr("حجز بدون دفع", "Book (Pay Later)")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
