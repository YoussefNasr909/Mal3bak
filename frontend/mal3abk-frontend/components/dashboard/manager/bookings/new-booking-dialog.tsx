"use client"

import { useState, useMemo, useEffect, useCallback, useTransition } from "react"
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Zap,
  CalendarDays,
  ChevronDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLanguage } from "@/components/providers/language-provider"
import {
  createManualBooking as createManualBookingApi,
  lookupManualBookingCustomerByPhone as lookupManualBookingCustomerByPhoneApi,
  getBookedSlots,
  type ManualBookingCustomerLookup,
  type BookedSlot,
} from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatOperatingHours, isPeakHour, isStartTimeCoveredBySelection, minutesToTime, timeToMinutes } from "@/lib/time"
import { getAbsoluteBookingTimes, getBookableStartDateForCourt, getBookingDateForCourtSlot } from "@/lib/date"
import { format12h } from "./shared"

interface NewBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  managerCourts: any[]
  todayISO: string
  onBookingCreated: () => Promise<void>
}

export function NewBookingDialog({
  open,
  onOpenChange,
  managerCourts,
  todayISO,
  onBookingCreated,
}: NewBookingDialogProps) {
  const { language, t } = useLanguage()

  const [nbCourtId, setNbCourtId] = useState("")
  const [nbDate, setNbDate] = useState("")
  const [nbTime, setNbTime] = useState("")
  const [, startTimeTransition] = useTransition()
  const [nbDuration, setNbDuration] = useState<1 | 2 | 3>(1)
  const [nbGuestName, setNbGuestName] = useState("")
  const [nbGuestPhone, setNbGuestPhone] = useState("")
  const [nbMatchedCustomer, setNbMatchedCustomer] = useState<ManualBookingCustomerLookup | null>(null)
  const [nbLookingUpCustomer, setNbLookingUpCustomer] = useState(false)
  const [nbSubmitting, setNbSubmitting] = useState(false)
  const [nbNote, setNbNote] = useState("")
  const [nbDiscountEnabled, setNbDiscountEnabled] = useState(false)
  const [nbDiscountType, setNbDiscountType] = useState<"percentage" | "fixed">("percentage")
  const [nbDiscountValue, setNbDiscountValue] = useState("")
  const [nbCalendarOpen, setNbCalendarOpen] = useState(false)
  type ManagerBlockedSlot = BookedSlot & { status?: string }

  const [nbBookedSlots, setNbBookedSlots] = useState<ManagerBlockedSlot[]>([])
  const [nbLoadingSlots, setNbLoadingSlots] = useState(false)

  const nbSelectedCourt = useMemo(() => managerCourts.find((c) => c.id === nbCourtId), [managerCourts, nbCourtId])
  const nbBookableStartDate = getBookableStartDateForCourt(nbSelectedCourt)
  const nbOpenTime = nbSelectedCourt?.openTime || "08:00"
  const nbOffPeakPrice = nbSelectedCourt?.offPeakPrice ?? nbSelectedCourt?.peakPrice ?? 0
  const nbPeakPrice = nbSelectedCourt?.peakPrice ?? nbOffPeakPrice
  const nbHasVariablePricing = nbPeakPrice !== nbOffPeakPrice
  const nbGetSlotBookingDate = useCallback(
    (date: string, time: string) => getBookingDateForCourtSlot(date, time, nbSelectedCourt),
    [nbSelectedCourt],
  )

  const nbDurationOptions = useMemo<(1 | 2 | 3)[]>(() => {
    if (!nbSelectedCourt) return [1, 2, 3]

    const openM = timeToMinutes(nbSelectedCourt.openTime || "08:00")
    let closeM = timeToMinutes(nbSelectedCourt.closeTime || "23:00")
    if (closeM <= openM) closeM += 1440

    const sessionHours = Math.max(1, Math.floor((closeM - openM) / 60))
    const allowed = [1, 2, 3].filter((hours) => hours <= sessionHours) as (1 | 2 | 3)[]
    return allowed.length ? allowed : [1]
  }, [nbSelectedCourt])

  const checkNextDayManager = useCallback((time: string) => {
    if (!time || !nbSelectedCourt) return false
    const tm = timeToMinutes(time)
    const om = timeToMinutes(nbSelectedCourt.openTime || "08:00")
    const cm = timeToMinutes(nbSelectedCourt.closeTime || "23:00")
    if (cm < om || cm === om) return tm < om
    return false
  }, [nbSelectedCourt])

  useEffect(() => {
    if (!nbDurationOptions.includes(nbDuration)) {
      setNbDuration(nbDurationOptions[0] || 1)
      setNbTime("")
    }
  }, [nbDuration, nbDurationOptions])

  const nbEndTime = useMemo(() => {
    if (!nbTime) return ""
    let endM = timeToMinutes(nbTime) + nbDuration * 60
    if (endM === 1440) return "00:00"
    return minutesToTime(endM)
  }, [nbTime, nbDuration])

  const nbSlots = useMemo(() => {
    if (!nbSelectedCourt) return []
    let open = timeToMinutes(nbOpenTime)
    let close = timeToMinutes(nbSelectedCourt.closeTime || "23:00")
    if (close <= open) close += 1440
    const firstSlotStart = Math.ceil(open / 60) * 60
    const s: string[] = []
    for (let m = firstSlotStart; m <= close - (nbDuration * 60); m += 60) {
      s.push(minutesToTime(m % 1440))
    }
    return s
  }, [nbSelectedCourt, nbDuration, nbOpenTime])
  useEffect(() => {
    if (!nbCourtId || !nbDate) {
      setNbBookedSlots([])
      return
    }
    let cancelled = false
    setNbLoadingSlots(true)
    getBookedSlots(nbCourtId, nbDate)
      .then((res) => { if (!cancelled) setNbBookedSlots(res.bookedSlots || []) })
      .catch(() => { if (!cancelled) setNbBookedSlots([]) })
      .finally(() => { if (!cancelled) setNbLoadingSlots(false) })
    return () => { cancelled = true }
  }, [nbCourtId, nbDate])


  const nbGetSlotBlockInfo = useCallback((startTime: string, durationH: number) => {
    if (!nbSelectedCourt || !nbDate) return { blocked: false as const, reason: null as string | null }

    let closeM = timeToMinutes(nbSelectedCourt.closeTime || "23:00")
    const openM = timeToMinutes(nbSelectedCourt.openTime || "08:00")
    if (closeM <= openM) closeM += 1440

    let startM = timeToMinutes(startTime)
    if (startM < openM && (startM + 1440) <= closeM) startM += 1440

    const endM = startM + durationH * 60
    if (endM > closeM) {
      return {
        blocked: true as const,
        reason: language === "ar" ? "خارج ساعات العمل" : "Outside hours",
      }
    }

    const openTime = nbSelectedCourt.openTime || "08:00"
    const useOpeningDay = nbSelectedCourt.useOpeningDayForOvernightBookings === true
    const endTime = minutesToTime(timeToMinutes(startTime) + durationH * 60)
    const bookingDate = nbGetSlotBookingDate(nbDate, startTime)
    const requested = getAbsoluteBookingTimes(bookingDate, startTime, endTime, openTime, useOpeningDay)

    const overlap = nbBookedSlots.find((slot) => {
      const blocked = getAbsoluteBookingTimes(
        slot.date,
        slot.startTime,
        slot.endTime,
        openTime,
        slot.useOpeningDayForOvernightBookings === true,
      )
      return requested.startMs < blocked.endMs && blocked.startMs < requested.endMs
    })

    if (overlap) {
      const reason = overlap.reason
        ? overlap.reason
        : overlap.status === "completed"
          ? (language === "ar" ? "محجوز ومكتمل" : "Booked")
          : (language === "ar" ? "محجوز" : "Booked")
      return { blocked: true as const, reason }
    }

    const { startMs: slotStartMs } = getAbsoluteBookingTimes(
      bookingDate,
      startTime,
      endTime,
      nbSelectedCourt.openTime || "08:00",
      useOpeningDay,
    )
    const GRACE_PERIOD_MS = 30 * 60 * 1000
    if (slotStartMs + GRACE_PERIOD_MS < Date.now()) {
      return {
        blocked: true as const,
        reason: language === "ar" ? "انتهى الوقت" : "Past",
      }
    }

    return { blocked: false as const, reason: null as string | null }
  }, [language, nbBookedSlots, nbDate, nbGetSlotBookingDate, nbSelectedCourt])

  const nbVisibleSlots = useMemo(() => {
    let slots = nbSlots

    if (!nbTime || nbDuration <= 1) return slots

    return slots.filter((time) => !isStartTimeCoveredBySelection(time, nbTime, nbDuration, nbOpenTime))
  }, [nbSlots, nbTime, nbDuration, nbOpenTime])

  const nbSlotOk = useMemo(() => {
    if (!nbSelectedCourt || !nbDate || !nbTime) return false

    let closeM = timeToMinutes(nbSelectedCourt.closeTime || "23:00")
    const openM = timeToMinutes(nbSelectedCourt.openTime || "08:00")
    if (closeM < openM || closeM === openM) closeM += 1440

    let startM = timeToMinutes(nbTime)
    if (checkNextDayManager(nbTime)) startM += 1440

    const endM = startM + nbDuration * 60
    if (endM > closeM) return false

    const { startMs: slotStartMs } = getAbsoluteBookingTimes(
      nbGetSlotBookingDate(nbDate, nbTime),
      nbTime,
      nbEndTime || nbTime,
      nbSelectedCourt.openTime || "08:00",
      nbSelectedCourt.useOpeningDayForOvernightBookings === true,
    )
    const GRACE_PERIOD_MS = 30 * 60 * 1000
    if (slotStartMs + GRACE_PERIOD_MS < Date.now()) return false

    return !nbGetSlotBlockInfo(nbTime, nbDuration).blocked
  }, [nbSelectedCourt, nbDate, nbTime, nbDuration, nbEndTime, nbGetSlotBlockInfo, nbGetSlotBookingDate, checkNextDayManager])

  const nbTotalPrice = useMemo(() => {
    if (!nbSelectedCourt || !nbTime) return 0
    const startM = timeToMinutes(nbTime)
    let total = 0
    for (let i = 0; i < nbDuration; i++) {
      const slotTime = minutesToTime((startM + i * 60) % 1440)
      total += isPeakHour(slotTime, nbSelectedCourt.peakStartTime, nbSelectedCourt.peakEndTime) ? nbPeakPrice : nbOffPeakPrice
    }
    return total
  }, [nbSelectedCourt, nbTime, nbDuration, nbOffPeakPrice, nbPeakPrice])

  const nbDiscountAmount = useMemo(() => {
    if (!nbDiscountEnabled || !nbDiscountValue || nbTotalPrice <= 0) return 0
    const value = Number(nbDiscountValue)
    if (!Number.isFinite(value) || value <= 0) return 0
    return nbDiscountType === "percentage"
      ? Math.min(nbTotalPrice, Math.round((nbTotalPrice * Math.min(value, 100) / 100) * 100) / 100)
      : Math.min(nbTotalPrice, value)
  }, [nbDiscountEnabled, nbDiscountType, nbDiscountValue, nbTotalPrice])

  const nbFinalPrice = Math.max(0, Math.round((nbTotalPrice - nbDiscountAmount) * 100) / 100)

  const nbNormalizedGuestPhone = useMemo(() => nbGuestPhone.replace(/\D+/g, ""), [nbGuestPhone])
  const nbPhoneFormatValid = useMemo(
    () => /^(?:0\d{10}|\+20 ?\d{10})$/.test(nbGuestPhone.trim()),
    [nbGuestPhone],
  )

  const clearMatchedCustomer = useCallback(
    (clearAutoFilledName = false) => {
      const matchedName = nbMatchedCustomer?.name
      if (clearAutoFilledName && matchedName) {
        setNbGuestName((prev) => (prev === matchedName ? "" : prev))
      }
      setNbMatchedCustomer(null)
    },
    [nbMatchedCustomer]
  )

  const handleNbGuestPhoneChange = useCallback(
    (value: string) => {
      const normalizedValue = value.replace(/\D+/g, "")
      if (nbMatchedCustomer && normalizedValue !== nbMatchedCustomer.phone) {
        clearMatchedCustomer(true)
      }
      setNbGuestPhone(value)
    },
    [clearMatchedCustomer, nbMatchedCustomer]
  )

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setNbCourtId(""); setNbDate(""); setNbTime(""); setNbDuration(1)
      setNbGuestName(""); setNbGuestPhone(""); setNbMatchedCustomer(null); setNbLookingUpCustomer(false); setNbBookedSlots([]); setNbNote("")
      setNbDiscountEnabled(false); setNbDiscountType("percentage"); setNbDiscountValue("")
    } else {
      const defaultCourt = managerCourts.length === 1 ? managerCourts[0] : null
      if (defaultCourt) {
        setNbCourtId(defaultCourt.id)
        setNbDate(getBookableStartDateForCourt(defaultCourt))
      } else {
        setNbDate(todayISO)
      }
    }
  }, [open, todayISO, managerCourts])

  useEffect(() => {
    if (!open || !nbSelectedCourt) return
    if (!nbDate || nbDate < nbBookableStartDate) {
      setNbDate(nbBookableStartDate)
      setNbTime("")
    }
  }, [open, nbSelectedCourt, nbDate, nbBookableStartDate])

  // Phone lookup
  useEffect(() => {
    if (!open) return

    if (!nbPhoneFormatValid) {
      setNbLookingUpCustomer(false)
      if (nbMatchedCustomer) clearMatchedCustomer(true)
      return
    }

    if (nbMatchedCustomer?.phone === nbNormalizedGuestPhone) {
      setNbLookingUpCustomer(false)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setNbLookingUpCustomer(true)
      try {
        const res = await lookupManualBookingCustomerByPhoneApi(nbGuestPhone.trim())
        if (cancelled) return
        if (res.user) {
          setNbMatchedCustomer(res.user)
          setNbGuestName(res.user.name)
        } else {
          clearMatchedCustomer(true)
        }
      } catch {
        if (cancelled) return
        clearMatchedCustomer(true)
      } finally {
        if (!cancelled) setNbLookingUpCustomer(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [clearMatchedCustomer, nbGuestPhone, nbMatchedCustomer, nbNormalizedGuestPhone, nbPhoneFormatValid, open])

  const handleCreateBooking = async () => {
    if (!nbCourtId || !nbDate || !nbTime || !nbSlotOk) return
    const matchedCustomer = nbMatchedCustomer
    const guestName = (matchedCustomer?.name ?? nbGuestName).trim()
    const guestPhone = nbGuestPhone.trim()
    if (!matchedCustomer && guestName.length < 2) {
      toast.error(
        language === "ar" ? "أدخل اسم العميل (حرفان على الأقل)." : "Enter the guest name (at least 2 characters).",
      )
      return
    }
    if (!guestPhone) {
      toast.error(language === "ar" ? "أدخل رقم هاتف العميل." : "Enter the guest phone number.")
      return
    }
    if (!nbPhoneFormatValid) {
      toast.error("Use 0XXXXXXXXXX or +20 XXXXXXXXXX for the phone number.")
      return
    }
    if (nbDiscountEnabled) {
      const discountValue = Number(nbDiscountValue)
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        toast.error(language === "ar" ? "أدخل قيمة خصم صحيحة." : "Enter a valid discount value.")
        return
      }
      if (nbDiscountType === "percentage" && discountValue > 100) {
        toast.error(language === "ar" ? "الخصم النسبي لا يمكن أن يتجاوز 100٪." : "Percentage discount cannot exceed 100%.")
        return
      }
      if (nbDiscountType === "fixed" && discountValue > nbTotalPrice) {
        toast.error(language === "ar" ? "الخصم الثابت لا يمكن أن يتجاوز السعر الكامل للحجز." : "Fixed discount cannot exceed the full booking price.")
        return
      }
    }
    setNbSubmitting(true)
    try {
      const notes = matchedCustomer
        ? undefined
        : `Walk-in: ${guestName} | Phone: ${guestPhone}`

      const res = await createManualBookingApi({
        courtId: nbCourtId,
        date: nbGetSlotBookingDate(nbDate, nbTime),
        startTime: nbTime,
        endTime: nbEndTime,
        userId: matchedCustomer?.id,
        guestName: matchedCustomer ? undefined : guestName,
        guestPhone: matchedCustomer ? undefined : guestPhone,
        notes: nbNote.trim() || notes,
        paymentMethod: "cash",
        paymentStatus: "paid",
        ...(nbDiscountEnabled ? { discountType: nbDiscountType, discountValue: Number(nbDiscountValue) } : {}),
      })

      const newBooking = res.booking || res

      toast.success(
        language === "ar"
          ? `تم إنشاء الحجز ✅ الكود: ${newBooking.checkInCode || (newBooking as any).code}`
          : `Booking created ✅ Code: ${newBooking.checkInCode || (newBooking as any).code}`,
      )

      onOpenChange(false)
      await onBookingCreated()
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "تعذر إنشاء الحجز" : "Could not create booking"))
    } finally {
      setNbSubmitting(false)
    }
  }

  // Format nbDate for display in the calendar button
  const nbDateDisplayLabel = useMemo(() => {
    if (!nbDate) return language === "ar" ? "اختر تاريخاً" : "Pick a date"
    const d = new Date(nbDate + "T12:00:00")
    return d.toLocaleDateString(language === "ar" ? "ar-EG" : "en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }, [nbDate, language])

  const nbCalendarValue = useMemo(() => {
    if (!nbDate) return undefined
    return new Date(nbDate + "T12:00:00")
  }, [nbDate])

  const nbBookableStartDateObj = useMemo(() => {
    if (!nbBookableStartDate) return undefined
    return new Date(nbBookableStartDate + "T12:00:00")
  }, [nbBookableStartDate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-lg">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-border/50 px-5 pb-3 pt-5">
          <DialogTitle className="text-lg font-bold tracking-tight">
            {language === "ar" ? "حجز جديد (يدوي)" : "New Booking"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {language === "ar"
              ? "احجز لعميل مسجل أو زائر."
              : "Book for a registered or walk-in customer."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-6 touch-pan-y sm:px-5">

          {/* ── Court ── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {language === "ar" ? "الملعب" : "Court"}
            </p>
            <Select
              value={nbCourtId}
              onValueChange={(v) => {
                const nextCourt = managerCourts.find((c) => c.id === v)
                setNbCourtId(v)
                setNbDate(getBookableStartDateForCourt(nextCourt))
                setNbTime("")
              }}
            >
              <SelectTrigger className="rounded-xl h-11 text-sm">
                <SelectValue placeholder={language === "ar" ? "اختر ملعباً..." : "Choose a court..."} />
              </SelectTrigger>
              <SelectContent>
                {managerCourts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {language === "ar" ? c.name : c.nameEn} — {formatOperatingHours(c.openTime, c.closeTime, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Date ── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {language === "ar" ? "التاريخ" : "Date"}
            </p>
            <Popover open={nbCalendarOpen} onOpenChange={setNbCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl justify-between text-sm font-normal px-3"
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                    <span dir="ltr">{nbDateDisplayLabel}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={nbCalendarValue}
                  onSelect={(day) => {
                    if (!day) return
                    const y = day.getFullYear()
                    const m = String(day.getMonth() + 1).padStart(2, "0")
                    const d = String(day.getDate()).padStart(2, "0")
                    setNbDate(`${y}-${m}-${d}`)
                    setNbTime("")
                    setNbCalendarOpen(false)
                  }}
                  disabled={(day) =>
                    nbBookableStartDateObj ? day < nbBookableStartDateObj : false
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* ── Duration ── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {language === "ar" ? "المدة" : "Duration"}
            </p>
            <div className="flex p-1 bg-muted/30 rounded-2xl border border-border/40 gap-1">
              {nbDurationOptions.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => { setNbDuration(h); setNbTime("") }}
                  disabled={!nbCourtId || !nbDate}
                  className={cn(
                    "flex-1 h-9 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
                    nbDuration === h
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {language === "ar" ? `${h} س` : `${h}h`}
                </button>
              ))}
            </div>
          </div>

          {/* ── Time slots ── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {language === "ar" ? "وقت البداية" : "Start Time"}
            </p>
            {!nbCourtId || !nbDate ? (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground text-center">
                {language === "ar" ? "اختر الملعب والتاريخ أولاً." : "Select court and date first."}
              </div>
            ) : nbLoadingSlots ? (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground animate-pulse text-center">
                {language === "ar" ? "جاري تحميل التوافر..." : "Loading availability..."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3">
                {nbVisibleSlots.map((time) => {
                  const blockInfo = nbGetSlotBlockInfo(time, nbDuration)
                  const isAvailable = !blockInfo.blocked
                  const isSelected = nbTime === time
                  const peak = nbHasVariablePricing && isPeakHour(time, nbSelectedCourt?.peakStartTime, nbSelectedCourt?.peakEndTime)

                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => { if (isAvailable) startTimeTransition(() => setNbTime(time)) }}
                      disabled={!isAvailable}
                      aria-disabled={!isAvailable}
                      title={!isAvailable ? blockInfo.reason || undefined : undefined}
                      className={cn(
                        "relative flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-bold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-100",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : isAvailable
                            ? "border-border/60 bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
                            : "border-border/50 bg-muted/30 text-muted-foreground line-through decoration-2"
                      )}
                    >
                      <span
                        className={cn(
                          "font-bold",
                          !isAvailable && "text-muted-foreground"
                        )}
                        dir="ltr"
                      >
                        {format12h(time, language)}
                      </span>
                      {peak && isAvailable && (
                        <Zap className={cn("h-3 w-3 shrink-0", isSelected ? "text-amber-300" : "text-amber-500")} />
                      )}
                      {!isAvailable && blockInfo.reason && (
                        <span className="sr-only">
                          {blockInfo.reason}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {nbCourtId && nbDate && !nbLoadingSlots &&
              nbVisibleSlots.filter((time) => !nbGetSlotBlockInfo(time, nbDuration).blocked).length === 0 && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive text-center">
                {language === "ar" ? "لا توجد مواعيد متاحة لهذا اليوم بهذه المدة." : "No slots available for this duration on this day."}
              </div>
            )}
            {nbTime && (
              <div className={cn(
                "rounded-xl border p-2.5 text-xs flex items-center gap-2",
                nbSlotOk
                  ? "bg-green-500/8 border-green-500/20 text-green-700 dark:text-green-300"
                  : "bg-red-500/8 border-red-500/20 text-red-700 dark:text-red-300",
              )}>
                {nbSlotOk ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                <span className="font-semibold">
                  {nbSlotOk ? (language === "ar" ? "متاح ✅" : "Available") : (language === "ar" ? "غير متاح" : "Unavailable")}
                </span>
                <span className="text-muted-foreground" dir="ltr">
                  {format12h(nbTime, language)} → {format12h(nbEndTime, language)}
                </span>
              </div>
            )}
          </div>

          {/* ── Customer Info ── */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {language === "ar" ? "بيانات العميل" : "Customer Info"}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {language === "ar" ? "الاسم" : "Name"}
                  <span className="text-destructive ml-0.5" aria-hidden>*</span>
                </Label>
                <Input
                  value={nbGuestName}
                  onChange={(e) => setNbGuestName(e.target.value)}
                  placeholder={language === "ar" ? "مثال: أحمد محمد" : "e.g. Ahmed Mohamed"}
                  className={cn(
                    "rounded-xl h-10 text-sm",
                    nbMatchedCustomer && "cursor-not-allowed bg-muted/60 text-muted-foreground"
                  )}
                  autoComplete="off"
                  name="manual-booking-guest-name"
                  required
                  minLength={2}
                  readOnly={Boolean(nbMatchedCustomer)}
                />
                {nbMatchedCustomer && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    {language === "ar" ? "لاعب مسجل — الاسم مقفل" : "Registered player — name locked"}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {language === "ar" ? "الهاتف" : "Phone"}
                  <span className="text-destructive ml-0.5" aria-hidden>*</span>
                </Label>
                <Input
                  value={nbGuestPhone}
                  onChange={(e) => handleNbGuestPhoneChange(e.target.value)}
                  placeholder={language === "ar" ? "مثال: 01012345678" : "e.g. 01012345678 or +20 1012345678"}
                  className="rounded-xl h-10 text-sm"
                  dir="ltr"
                  autoComplete="off"
                  name="manual-booking-guest-phone"
                  inputMode="tel"
                  maxLength={14}
                  pattern="(?:0[0-9]{10}|\\+20 ?[0-9]{10})"
                  aria-invalid={Boolean(nbGuestPhone) && !nbPhoneFormatValid}
                  required
                />
                {nbGuestPhone && !nbPhoneFormatValid && (
                  <p className="text-[10px] text-destructive">
                    {language === "ar" ? "استخدم 11 رقماً يبدأ بـ 0 أو +20 متبوعاً بـ 10 أرقام." : "Use 0XXXXXXXXXX or +20 XXXXXXXXXX."}
                  </p>
                )}
                {nbLookingUpCustomer && (
                  <p className="text-[10px] text-muted-foreground">
                    {language === "ar" ? "جارٍ التحقق..." : "Checking..."}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {language === "ar" ? "خصم" : "Discount"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {language === "ar" ? "اختياري على السعر الكامل للحجز" : "Optional discount on the full booking price"}
                </p>
              </div>
              <div className="flex items-center gap-2" dir={language === "ar" ? "rtl" : "ltr"}>
                <span className="text-xs font-semibold text-muted-foreground">
                  {language === "ar" ? "تفعيل الخصم" : "Enable discount"}
                </span>
                <Switch dir="ltr" checked={nbDiscountEnabled} onCheckedChange={setNbDiscountEnabled} aria-label={language === "ar" ? "تفعيل الخصم" : "Enable discount"} />
              </div>
            </div>
            {nbDiscountEnabled && (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                <div className="flex rounded-lg border border-border/60 bg-background p-1" role="group" aria-label={language === "ar" ? "نوع الخصم" : "Discount type"}>
                  <button type="button" className={cn("flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors", nbDiscountType === "percentage" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} onClick={() => setNbDiscountType("percentage")}>
                    {language === "ar" ? "نسبة مئوية" : "Percentage"}
                  </button>
                  <button type="button" className={cn("flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors", nbDiscountType === "fixed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} onClick={() => setNbDiscountType("fixed")}>
                    {language === "ar" ? "قيمة ثابتة" : "Fixed amount"}
                  </button>
                </div>
                <Input type="number" min={0} max={nbDiscountType === "percentage" ? 100 : nbTotalPrice || undefined} step="0.01" value={nbDiscountValue} onChange={(e) => setNbDiscountValue(e.target.value)} placeholder={nbDiscountType === "percentage" ? "e.g. 20" : "e.g. 200"} className="rounded-lg h-10 text-sm" inputMode="decimal" aria-label={language === "ar" ? "قيمة الخصم" : "Discount value"} />
              </div>
            )}
          </div>

          {/* ── Note ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {language === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}
              </p>
              <span className="text-[10px] text-muted-foreground">{nbNote.length}/200</span>
            </div>
            <textarea
              value={nbNote}
              onChange={(e) => setNbNote(e.target.value.slice(0, 200))}
              placeholder={language === "ar" ? "أضف ملاحظة للحجز..." : "Add a note to this booking..."}
              rows={2}
              className="w-full rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
            />
          </div>

          {/* ── Price summary ── */}
          <div className="flex items-center justify-between rounded-xl bg-primary/8 border border-primary/20 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {language === "ar" ? "الإجمالي" : "Total"}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                {nbDiscountAmount > 0
                  ? (language === "ar"
                    ? `السعر الكامل ${nbTotalPrice} ج.م - الخصم ${nbDiscountAmount} ج.م`
                    : `Full price ${nbTotalPrice} EGP - discount ${nbDiscountAmount} EGP`)
                  : (language === "ar" ? "كود دخول من 8 رموز" : "8-char check-in code generated")}
              </p>
            </div>
            <span className="text-2xl font-extrabold text-primary">
              {nbTime ? nbFinalPrice : 0}
              <span className="text-sm font-semibold ml-1 text-primary/70">{language === "ar" ? "ج.م" : "EGP"}</span>
            </span>
          </div>

        </div>

        {/* ── Footer ── */}
        <DialogFooter className="shrink-0 gap-2 border-t border-border/50 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-5 sm:pb-5">
          <Button
            variant="ghost"
            className="h-12 rounded-2xl flex-1"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-12 rounded-2xl flex-1 font-bold gap-2"
            onClick={handleCreateBooking}
            disabled={
              !nbSlotOk ||
              nbSubmitting ||
              (!nbMatchedCustomer && nbGuestName.trim().length < 2) ||
              !nbGuestPhone.trim()
            }
          >
            {nbSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {language === "ar" ? "جاري الحجز..." : "Booking..."}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {language === "ar" ? "تأكيد الحجز" : "Confirm Booking"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
