"use client"

import { Building2, CalendarDays, Clock3, Copy, MapPin, Ticket } from "lucide-react"

import type { Booking } from "@/lib/types"
import { format12h } from "@/lib/time"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type CheckInCodeDialogContentProps = {
  booking: Booking
  language: "ar" | "en"
  onClose: () => void
  onCopy: (code: string) => void
}

function formatBookingDate(dateISO: string, language: "ar" | "en") {
  const [year, month, day] = String(dateISO || "").split("-").map(Number)
  if (!year || !month || !day) return dateISO

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Africa/Cairo",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function DetailRow({
  icon: Icon,
  label,
  value,
  dir,
}: {
  icon: typeof CalendarDays
  label: string
  value: string
  dir?: "ltr" | "rtl"
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span>{label}</span>
      </div>
      <p dir={dir} className="min-w-0 text-right text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  )
}

export function CheckInCodeDialogContent({
  booking,
  language,
  onClose,
  onCopy,
}: CheckInCodeDialogContentProps) {
  const courtName =
    language === "ar" ? booking.courtName || booking.courtNameEn : booking.courtNameEn || booking.courtName
  const city =
    language === "ar"
      ? booking.courtCity || booking.courtCityEn || ""
      : booking.courtCityEn || booking.courtCity || ""
  const code = booking.checkInCode || "--------"

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <DialogHeader className="space-y-2 text-start">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Ticket className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <DialogTitle className="text-lg font-bold text-foreground">
            {language === "ar" ? "رمز الحضور الخاص بك" : "Your check-in code"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {language === "ar"
              ? "أظهره للمدير عند الوصول."
              : "Show this to the manager when you arrive."}
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="rounded-3xl border border-primary/15 bg-primary/[0.04] px-4 py-4 text-center shadow-sm sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
          {language === "ar" ? "رمز الدخول" : "Entry code"}
        </p>
        <p dir="ltr" className="mt-2 font-mono text-[1.9rem] font-black tracking-[0.18em] text-primary sm:text-[2.15rem]">
          {code}
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background px-3 py-2 shadow-sm">
        <DetailRow
          icon={Building2}
          label={language === "ar" ? "الملعب" : "Court"}
          value={courtName}
        />
        <DetailRow
          icon={CalendarDays}
          label={language === "ar" ? "التاريخ" : "Date"}
          value={formatBookingDate(booking.date, language)}
        />
        <DetailRow
          icon={Clock3}
          label={language === "ar" ? "الوقت" : "Time"}
          value={`${format12h(booking.startTime, language)} - ${format12h(booking.endTime, language)}`}
          dir="ltr"
        />
        {city ? (
          <DetailRow
            icon={MapPin}
            label={language === "ar" ? "الموقع" : "Location"}
            value={city}
          />
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="rounded-2xl bg-transparent sm:min-w-24" onClick={onClose}>
          {language === "ar" ? "إغلاق" : "Close"}
        </Button>
        <Button
          type="button"
          className="rounded-2xl sm:min-w-32"
          onClick={() => booking.checkInCode && onCopy(booking.checkInCode)}
          disabled={!booking.checkInCode}
        >
          <Copy className="me-2 h-4 w-4" />
          {language === "ar" ? "نسخ الرمز" : "Copy code"}
        </Button>
      </div>
    </div>
  )
}
