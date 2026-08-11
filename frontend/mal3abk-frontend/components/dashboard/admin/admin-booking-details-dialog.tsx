"use client"

import { memo } from "react"
import { format } from "date-fns"
import type { Locale } from "date-fns"
import {
  Building2,
  CalendarDays,
  Clock,
  MapPin,
  CheckCircle2,
  Check,
  XCircle,
  ShieldAlert,
  Trash2,
  Receipt,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { isWalkInBooking } from "@/hooks/use-bookings-data"
import { hasBookingNote } from "@/lib/booking-notes"
import { sportTypes } from "@/lib/constants"
import { BookingNotePanel } from "@/components/dashboard/manager/bookings/booking-note"
import {
  BookingDetailsShell,
  BookingDetailsHero,
  BookingDetailsBody,
  BookingDetailsSection,
  BookingDetailsRow,
  BookingDetailsPlayerCard,
} from "@/components/dashboard/bookings/booking-details-primitives"
import { cn } from "@/lib/utils"

type BookingRow = Record<string, any>
type CourtRow = Record<string, any>
type BookingStatusAction = "confirm" | "complete" | "cancel" | "no_show"

function statusTone(status: string) {
  const s = String(status || "").toLowerCase()
  if (s === "checked_in" || s === "confirmed" || s === "completed") return "success"
  if (s === "pending_payment" || s === "pending") return "warning"
  if (s === "cancelled" || s === "no_show") return "destructive"
  return "secondary"
}

function format12h(time: string, lang: string) {
  if (!time) return ""
  const [hh, mm] = time.split(":").map(Number)
  const ampm = hh >= 12 ? (lang === "ar" ? "م" : "PM") : (lang === "ar" ? "ص" : "AM")
  const h12 = hh % 12 || 12
  return `\u200E${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ampm}`
}

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "0"
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
  } catch {
    return String(Math.round(n))
  }
}

export type AdminBookingDetailsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: BookingRow | null
  language: string
  locale: Locale
  getPlayerInfo: (b: BookingRow) => {
    id: string
    name: string
    phone: string
    email: string
    avatar: string
  }
  getCourtInfo: (b: BookingRow) => {
    name: string
    city: string
    address: string
    sportType: string
    court?: CourtRow
  }
  bookingDateTime: (b: BookingRow, court?: CourtRow) => Date
  getStatusLabel: (status: string) => string
  getPaymentLabel: (paymentStatus: string) => string
  onRequestAction: (id: string, action: BookingStatusAction) => void
  onArchive: (id: string) => void
}

export const AdminBookingDetailsDialog = memo(function AdminBookingDetailsDialog({
  open,
  onOpenChange,
  booking: b,
  language,
  locale,
  getPlayerInfo,
  getCourtInfo,
  bookingDateTime,
  getStatusLabel,
  getPaymentLabel,
  onRequestAction,
  onArchive,
}: AdminBookingDetailsDialogProps) {
  const rtl = language === "ar"
  const dialogTitle = rtl ? "تفاصيل الحجز" : "Booking details"

  if (!open || !b) {
    return null
  }

  const court = getCourtInfo(b)
  const d = bookingDateTime(b, court.court)
  const player = getPlayerInfo(b)
  const amount = Number(b.totalPrice ?? b.amount ?? 0)
  const status = String(b.status || "").toLowerCase()
  const paymentLabel = getPaymentLabel(String(b.paymentStatus || "pending"))

  const sportLabel = court.sportType
    ? rtl
      ? sportTypes?.[court.sportType]?.ar || court.sportType
      : sportTypes?.[court.sportType]?.en || court.sportType
    : "—"

  const durationMin = (() => {
    const st = String(b.startTime || "00:00")
    const et = String(b.endTime || "00:00")
    const toMin = (t: string) => {
      const [hh, mm] = t.split(":").map(Number)
      return hh * 60 + mm
    }
    let v = toMin(et) - toMin(st)
    if (v < 0) v += 24 * 60
    return Number.isFinite(v) && v > 0 ? v : 0
  })()

  const quickActions = [
    {
      key: "confirm" as const,
      label: rtl ? "تأكيد" : "Confirm",
      icon: CheckCircle2,
      variant: "default" as const,
      show: status !== "confirmed" && status !== "completed" && status !== "cancelled",
    },
    {
      key: "complete" as const,
      label: rtl ? "تسجيل الحضور" : "Check in",
      icon: Check,
      variant: "secondary" as const,
      show: status !== "completed" && status !== "cancelled",
    },
    {
      key: "cancel" as const,
      label: rtl ? "إلغاء" : "Cancel",
      icon: XCircle,
      variant: "outline" as const,
      show: status !== "cancelled",
    },
    {
      key: "no_show" as const,
      label: rtl ? "لم يحضر" : "No-show",
      icon: ShieldAlert,
      variant: "outline" as const,
      show: status !== "cancelled" && status !== "completed",
    },
    {
      key: "delete" as const,
      label: rtl ? "أرشفة" : "Archive",
      icon: Trash2,
      variant: "destructive" as const,
      show: true,
    },
  ].filter((a) => a.show)

  const scheduleText = `${format(d, "PPP", { locale })} · ${format12h(b.startTime, language)} – ${format12h(b.endTime, language)}${durationMin ? ` · ${durationMin}m` : ""}`

  const footer = (
    <div className="flex w-full flex-col gap-2">
      {quickActions.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Button
                key={action.key}
                variant={action.variant}
                size="sm"
                className={cn(
                  "h-10 rounded-xl text-xs",
                  action.key === "delete" && "col-span-2",
                )}
                onClick={() => {
                  if (action.key === "delete") {
                    onArchive(String(b.id))
                    onOpenChange(false)
                    return
                  }
                  onRequestAction(String(b.id), action.key)
                }}
              >
                <Icon className="me-1.5 h-3.5 w-3.5 shrink-0" />
                {action.label}
              </Button>
            )
          })}
        </div>
      ) : null}
      <Button variant="outline" className="h-11 w-full rounded-xl" onClick={() => onOpenChange(false)}>
        {rtl ? "إغلاق" : "Close"}
      </Button>
    </div>
  )

  return (
    <BookingDetailsShell open={open} onOpenChange={onOpenChange} title={dialogTitle} footer={footer}>
      <BookingDetailsHero
        title={player.name}
        subtitle={`#${String(b.id || "").slice(0, 8)} · ${court.name}`}
        amount={formatMoney(amount)}
        amountSuffix={rtl ? "جنيه" : "EGP"}
        badges={
          <>
            <StatusBadge variant={statusTone(status) as any} dot>
              {getStatusLabel(status)}
            </StatusBadge>
            <Badge variant="outline" className="rounded-full text-[11px]">
              {paymentLabel}
            </Badge>
            {isWalkInBooking(b) ? (
              <Badge variant="outline" className="rounded-full border-warning/40 bg-warning/10 text-[11px] text-warning">
                {rtl ? "ضيف" : "Walk-in"}
              </Badge>
            ) : null}
          </>
        }
      />

      <BookingDetailsBody>
        <BookingDetailsSection title={rtl ? "الموعد" : "Schedule"}>
          <BookingDetailsRow
            icon={<CalendarDays className="h-4 w-4" />}
            label={rtl ? "التاريخ والوقت" : "Date & time"}
            value={scheduleText}
          />
        </BookingDetailsSection>

        <BookingDetailsSection title={rtl ? "الملعب" : "Court"}>
          <BookingDetailsRow
            icon={<Building2 className="h-4 w-4" />}
            label={rtl ? "الملعب" : "Court"}
            value={`${court.name} · ${sportLabel}`}
          />
          <BookingDetailsRow
            icon={<MapPin className="h-4 w-4" />}
            label={rtl ? "الموقع" : "Location"}
            value={`${court.city} · ${court.address}`}
          />
        </BookingDetailsSection>

        <BookingDetailsSection title={rtl ? "اللاعب" : "Player"}>
          <div className="p-3.5">
            <BookingDetailsPlayerCard
              language={language}
              name={player.name}
              phone={player.phone}
              email={player.email}
              copyLabel={rtl ? "نسخ" : "Copy"}
              onCopyPhone={() => {
                void navigator.clipboard.writeText(player.phone)
                toast.success(rtl ? "تم النسخ" : "Copied")
              }}
              avatar={
                <Avatar className="h-11 w-11 shrink-0 rounded-xl">
                  <AvatarImage src={player.avatar} />
                  <AvatarFallback>{String(player.name || "U").slice(0, 1)}</AvatarFallback>
                </Avatar>
              }
              meta={
                player.id ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {rtl ? "معرف:" : "ID:"} {player.id}
                  </p>
                ) : null
              }
            />
          </div>
        </BookingDetailsSection>

        <BookingDetailsSection title={rtl ? "الدفع" : "Payment"}>
          <BookingDetailsRow
            icon={
              <span className="text-[10px] font-black">{rtl ? "ج.م" : "EGP"}</span>
            }
            label={rtl ? "المبلغ" : "Amount"}
            value={`${formatMoney(amount)} ${rtl ? "جنيه" : "EGP"}`}
          />
          <BookingDetailsRow
            icon={<Receipt className="h-4 w-4" />}
            label={rtl ? "حالة الدفع" : "Payment status"}
            value={paymentLabel}
          />
        </BookingDetailsSection>

        {hasBookingNote(b.notes) ? (
          <BookingDetailsSection title={rtl ? "ملاحظة" : "Note"}>
            <div className="px-3.5 py-3">
              <BookingNotePanel note={b.notes} language={language} className="border-0 bg-transparent p-0" />
            </div>
          </BookingDetailsSection>
        ) : null}
      </BookingDetailsBody>
    </BookingDetailsShell>
  )
})
