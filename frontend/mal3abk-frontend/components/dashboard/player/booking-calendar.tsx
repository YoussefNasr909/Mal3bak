"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight, Clock, Copy, QrCode } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/components/providers/language-provider"
import { normalizeBookingStatus } from "@/hooks/use-bookings-data"
import { cn } from "@/lib/utils"
import type { Booking } from "@/lib/types"
import { getEgyptTodayString, getAbsoluteBookingTimes, formatEgyptISODate } from "@/lib/date"
import { format12h, minutesToTime, timeToMinutes } from "@/lib/time"

interface BookingCalendarProps {
  bookings: Booking[]
  allowPayment?: boolean
}

const EGYPT_TIME_ZONE = "Africa/Cairo"

function getRealBookingStart(booking: Booking) {
  const openRef = (booking as any).sessionOpenTime || (booking as any).courtOpenTime || "08:00"
  const endRef = booking.endTime || minutesToTime(timeToMinutes(booking.startTime || "00:00") + 60)
  const { start } = getAbsoluteBookingTimes(
    booking.date,
    booking.startTime || "00:00",
    endRef,
    openRef,
    (booking as any).useOpeningDayForOvernightBookings === true,
  )
  return start
}

function getRealBookingISODate(booking: Booking) {
  return formatEgyptISODate(getRealBookingStart(booking))
}

function getStatusColor(status: string) {
  switch (normalizeBookingStatus(status)) {
    case "confirmed":
      return "bg-green-500"
    case "checked_in":
      return "bg-emerald-500"
    case "completed":
      return "bg-blue-500"
    case "no_show":
    case "cancelled":
      return "bg-red-500"
    default:
      return "bg-gray-500"
  }
}

function getStatusLabel(status: string, lang: "ar" | "en") {
  const tr = (ar: string, en: string) => (lang === "ar" ? ar : en)
  switch (normalizeBookingStatus(status)) {
    case "confirmed":
      return tr("مؤكد", "Confirmed")
    case "checked_in":
      return tr("تم الحضور", "Checked In")
    case "completed":
      return tr("مكتمل", "Completed")
    case "no_show":
      return tr("لم يحضر", "Missed booking")
    case "cancelled":
      return tr("ملغي", "Cancelled")
    default:
      return status
  }
}

function hasAttendanceRecord(booking: Partial<Booking> | null | undefined) {
  return Boolean(
    booking?.status === "completed" ||
      booking?.checkInVerified === true ||
      booking?.checkedIn === true ||
      booking?.checkedInAt,
  )
}

function getDisplayStatus(booking: Booking) {
  const normalizedStatus = normalizeBookingStatus(booking.status)
  if (normalizedStatus === "no_show") return "no_show"
  if (normalizedStatus === "completed") return "completed"
  if (normalizedStatus === "confirmed" && hasAttendanceRecord(booking)) {
    return "checked_in"
  }
  return normalizedStatus
}

export function BookingCalendar({ bookings, allowPayment = true }: BookingCalendarProps) {  const { language, direction } = useLanguage()
  const lang = language === "ar" ? "ar" : "en"
  const tr = (ar: string, en: string) => (lang === "ar" ? ar : en)


  const todayISO = useMemo(() => getEgyptTodayString(), [])
  const [todayYear, todayMonth, todayDay] = todayISO.split("-").map(Number)

  // calendar state
  const [currentDate, setCurrentDate] = useState(() => new Date(todayYear, todayMonth - 1, 1))
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  // dialogs
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)





  // Build REAL QR when needed
  useEffect(() => {
    const run = async () => {
      if (!qrOpen || !selectedBooking?.checkInCode) return
      try {
        const payload = `mal3abi:${selectedBooking.id}:${selectedBooking.checkInCode}`
        const mod = await import("qrcode")
        const url = await mod.toDataURL(payload, { margin: 1, scale: 8 })
        setQrDataUrl(url)
      } catch {
        setQrDataUrl("")
      }
    }
    run()
  }, [qrOpen, selectedBooking?.id, selectedBooking?.checkInCode])

  const daysOfWeek =
    lang === "ar" ? ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  const months =
    lang === "ar"
      ? ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
      : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
  const startingDayIndex = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const PrevIcon = direction === "rtl" ? ChevronRight : ChevronLeft
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setSelectedDay(null)
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setSelectedDay(null)
  }

  const jumpToday = () => {
    setCurrentDate(new Date(todayYear, todayMonth - 1, 1))
    setSelectedDay(todayDay)
  }

  const isToday = (day: number) => {
    const checkISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return checkISO === todayISO
  }

  const isPastDay = (day: number) => {
    const checkISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return checkISO < todayISO
  }

  const bookingsByDay = useMemo(() => {
    const map = new Map<number, Booking[]>()
    for (const booking of bookings) {
      const [year, month, day] = getRealBookingISODate(booking).split("-").map(Number)

      if (month - 1 === currentDate.getMonth() && year === currentDate.getFullYear()) {
        if (!map.has(day)) map.set(day, [])
        map.get(day)!.push(booking)
      }
    }
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
      map.set(k, v)
    }
    return map
  }, [bookings, currentDate])

  const selectedDayBookings = useMemo(() => {
    if (selectedDay === null) return []
    return bookingsByDay.get(selectedDay) || []
  }, [selectedDay, bookingsByDay])

  const monthStats = useMemo(() => {
    const m = currentDate.getMonth()
    const y = currentDate.getFullYear()
    const monthBookings = bookings.filter((b) => {
      const [year, month] = getRealBookingISODate(b).split("-").map(Number)
      return month - 1 === m && year === y
    })
    const confirmed = monthBookings.filter((b) => b.status === "confirmed").length
    return { total: monthBookings.length, confirmed }
  }, [bookings, currentDate])

  const openBooking = (b: Booking) => {
    setSelectedBooking(b)
    setBookingDialogOpen(true)
  }

  const copyCode = async (checkInCode?: string) => {
    if (!checkInCode) return
    try {
      await navigator.clipboard.writeText(checkInCode)
      toast.success(tr("تم نسخ الكود", "Code copied"))
    } catch {
      toast.error(tr("تعذر النسخ", "Couldn't copy"))
    }
  }


  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevMonth}
              className="h-9 w-9 rounded-xl hover:bg-muted"
              aria-label={tr("الشهر السابق", "Previous month")}
            >
              <PrevIcon className="h-4 w-4" />
            </Button>

            <div className="text-center">
              <h3 className="text-lg font-semibold">
                {months[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>{tr("إجمالي", "Total")}: {monthStats.total}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {tr("مؤكدة", "Confirmed")}: {monthStats.confirmed}
                </span>

                <Button variant="ghost" size="sm" className="h-7 rounded-xl px-2 text-xs" onClick={jumpToday}>
                  {tr("اليوم", "Today")}
                </Button>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              className="h-9 w-9 rounded-xl hover:bg-muted"
              aria-label={tr("الشهر التالي", "Next month")}
            >
              <NextIcon className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="grid grid-cols-7 gap-1 mb-2 min-w-[560px]">
              {daysOfWeek.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto -mx-2 px-2">
            <div className="grid grid-cols-7 gap-1 min-w-[560px]">
              {Array.from({ length: startingDayIndex }, (_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const dayBookings = bookingsByDay.get(day) || []
                const hasBooking = dayBookings.length > 0
                const today = isToday(day)
                const past = isPastDay(day)
                const isSelected = selectedDay === day

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    disabled={past && !hasBooking}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-all relative",
                      today && !isSelected && "bg-primary text-primary-foreground font-bold",
                      isSelected && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background",
                      !today && !isSelected && hasBooking && "bg-primary/10 text-primary hover:bg-primary/20",
                      !today && !isSelected && !hasBooking && !past && "hover:bg-muted",
                      past && !hasBooking && "text-muted-foreground/50 cursor-not-allowed",
                      past && hasBooking && "text-muted-foreground bg-muted/50",
                    )}
                  >
                    <span className="font-medium">{day}</span>

                    {hasBooking && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayBookings.slice(0, 3).map((booking, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              "h-1 w-1 rounded-full",
                              today || isSelected ? "bg-primary-foreground" : getStatusColor(booking.status),
                            )}
                          />
                        ))}
                      </div>
                    )}

                    {dayBookings.length > 3 && (
                      <span className="absolute top-1 end-1 rounded-full bg-foreground/10 text-foreground text-[10px] px-1.5 py-0.5">
                        +{dayBookings.length - 3}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Bookings */}
      {selectedDay !== null && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {selectedDay} {months[currentDate.getMonth()]}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            {selectedDayBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {tr("لا توجد حجوزات في هذا اليوم", "No bookings on this day")}
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDayBookings.map((booking) => {
                  const displayStatus = getDisplayStatus(booking)
                  const showCheckInCode =
                    booking.status === "confirmed" &&
                    !hasAttendanceRecord(booking) &&
                    Boolean(booking.checkInCode)

                  return (
                  <button
                    key={booking.id}
                    onClick={() => openBooking(booking)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className={cn("h-10 w-1 rounded-full", getStatusColor(displayStatus))} />

                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-sm truncate">
                        {lang === "ar" ? booking.courtName : booking.courtNameEn}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format12h(booking.startTime, lang)} - {format12h(booking.endTime, lang)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className={cn("h-2 w-2 rounded-full", getStatusColor(displayStatus))} />
                          {getStatusLabel(displayStatus, lang)}
                        </span>
                      </div>

                      {showCheckInCode && (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-1 text-xs text-primary">
                          <span className="font-semibold">{tr("الكود:", "Code:")}</span>
                          <span className="font-extrabold tracking-widest">{booking.checkInCode}</span>
                        </div>
                      )}
                    </div>

                    <Badge variant="outline" className="text-xs rounded-xl">
                      {booking.amount} {tr("ج.م", "EGP")}
                    </Badge>
                  </button>
                )})}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
            <DialogTitle className="text-lg font-extrabold">{tr("تفاصيل الحجز", "Booking details")}</DialogTitle>
            <DialogDescription className="sr-only">{tr("مراجعة تفاصيل الحجز ورمز الدخول", "Review booking details and entry code")}</DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="px-6 py-5 space-y-5">
              {(() => {
                const displayStatus = getDisplayStatus(selectedBooking)
                const realBookingDate = getRealBookingStart(selectedBooking)
                const realBookingDateLabel = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
                  timeZone: EGYPT_TIME_ZONE,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }).format(realBookingDate)
                const showCheckInCode =
                  selectedBooking.status === "confirmed" &&
                  !hasAttendanceRecord(selectedBooking) &&
                  Boolean(selectedBooking.checkInCode)

                return (
                  <>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold truncate">
                      {lang === "ar" ? selectedBooking.courtName : selectedBooking.courtNameEn}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {realBookingDateLabel} • {format12h(selectedBooking.startTime, lang)} - {format12h(selectedBooking.endTime, lang)}
                    </p>
                  </div>

                  <Badge className={cn("text-white border-0", getStatusColor(displayStatus))}>
                    {getStatusLabel(displayStatus, lang)}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tr("الإجمالي", "Total")}</span>
                  <span className="font-extrabold">
                    {selectedBooking.amount} {tr("ج.م", "EGP")}
                  </span>
                </div>
              </div>

              {selectedBooking.notes?.trim() ? (
                <div className="rounded-2xl border border-border/60 bg-background p-4">
                  <p className="text-sm font-semibold">
                    {tr("ملاحظتك للملعب", "Your note to the venue")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {selectedBooking.notes.trim()}
                  </p>
                </div>
              ) : null}

              {showCheckInCode && selectedBooking.checkInCode && (
                <div className="rounded-2xl bg-primary/10 border border-primary/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{tr("كود الدخول", "Entry code")}</p>
                      <p className="text-2xl font-extrabold tracking-widest text-primary">{selectedBooking.checkInCode}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => copyCode(selectedBooking.checkInCode)}>
                        <Copy className="h-4 w-4 me-2" />
                        {tr("نسخ", "Copy")}
                      </Button>

                      <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => setQrOpen(true)}>
                        <QrCode className="h-4 w-4 me-2" />
                        {tr("QR", "QR")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
                  </>
                )
              })()}
            </div>
          )}

          <DialogFooter className="px-6 pb-6 pt-4 border-t border-border/50 gap-2 bg-background">
            <Button variant="outline" className="rounded-2xl flex-1 bg-transparent" onClick={() => setBookingDialogOpen(false)}>
              {tr("إغلاق", "Close")}
            </Button>


          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REAL QR Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">{tr("رمز QR", "QR Code")}</DialogTitle>
            <DialogDescription className="sr-only">{tr("اعرض رمز QR لتأكيد الحضور", "Display the QR code for check-in")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-border/30">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR" className="h-48 w-48" />
              ) : (
                <div className="h-48 w-48 bg-muted rounded-xl flex items-center justify-center">
                  <QrCode className="h-28 w-28 text-foreground" />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {tr("امسح هذا الرمز عند المدير لتأكيد الحضور.", "Scan this at the manager to confirm check-in.")}
            </p>
          </div>

          <DialogFooter>
            <Button className="w-full rounded-xl" onClick={() => setQrOpen(false)}>
              {tr("إغلاق", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
