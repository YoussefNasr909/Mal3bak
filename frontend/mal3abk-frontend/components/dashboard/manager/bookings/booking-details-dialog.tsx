"use client"

import { memo } from "react"
import {
  Building2,
  CalendarDays,
  Clock,
  MapPin,
  Copy,
  CheckCircle2,
  Hash,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { hasBookingNote } from "@/lib/booking-notes"
import type { Booking } from "@/lib/types"
import {
  getBookingDisplayStatus,
  getStatusBadgeVariant,
  isCheckedInBooking,
  isWalkInBooking,
} from "@/hooks/use-bookings-data"
import { format12h } from "./shared"
import { sportTypes } from "@/lib/constants"
import { toast } from "sonner"
import { BookingNotePanel } from "./booking-note"
import {
  BookingDetailsShell,
  BookingDetailsHero,
  BookingDetailsBody,
  BookingDetailsSection,
  BookingDetailsRow,
  BookingDetailsPlayerCard,
} from "@/components/dashboard/bookings/booking-details-primitives"

interface BookingDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: Booking | null
  playerInfo: { name: string; phone: string; email: string; avatar?: string } | null
  courtInfo: { name: string; address: string; city: string; sportType: string } | null
  language: string
  getStatusLabel: (status: string) => string
  formatDate: (date: string | Date) => string
  onCheckIn: (booking: Booking) => void
  t: (key: string) => string
}

export const BookingDetailsDialog = memo(function BookingDetailsDialog({
  open,
  onOpenChange,
  booking,
  playerInfo,
  courtInfo,
  language,
  getStatusLabel,
  formatDate,
  onCheckIn,
  t,
}: BookingDetailsDialogProps) {
  const isAr = language === "ar"
  const dialogTitle = isAr ? "تفاصيل الحجز" : "Booking details"
  const copyLabel = isAr ? "نسخ" : "Copy"
  const closeLabel = isAr ? "إغلاق" : "Close"
  const checkInLabel = isAr ? "تسجيل الحضور" : "Check in"

  if (!open || !booking || !playerInfo || !courtInfo) {
    return null
  }

  const displayStatus = getBookingDisplayStatus(booking)
  const amount = Number(booking.totalPrice ?? booking.amount ?? 0).toLocaleString()
  const sportLabel = courtInfo.sportType
    ? isAr
      ? sportTypes[courtInfo.sportType]?.ar
      : sportTypes[courtInfo.sportType]?.en
    : null
  const canCheckIn = !isCheckedInBooking(booking) && booking.status !== "cancelled"
  const walkIn = isWalkInBooking(booking)

  const footer = (
    <>
      <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
        {closeLabel}
      </Button>
      {canCheckIn ? (
        <Button
          className="h-11 flex-1 rounded-xl"
          onClick={() => {
            onOpenChange(false)
            onCheckIn(booking)
          }}
        >
          <CheckCircle2 className="me-2 h-4 w-4" />
          {checkInLabel}
        </Button>
      ) : null}
    </>
  )

  return (
    <BookingDetailsShell open={open} onOpenChange={onOpenChange} title={dialogTitle} footer={footer}>
      <BookingDetailsHero
        title={playerInfo.name}
        subtitle={courtInfo.name}
        amount={amount}
        amountSuffix={t("common.egp")}
        badges={
          <>
            <StatusBadge variant={getStatusBadgeVariant(displayStatus)} dot>
              {getStatusLabel(displayStatus)}
            </StatusBadge>
            {walkIn ? (
              <Badge variant="outline" className="rounded-full border-warning/40 bg-warning/10 text-warning text-[11px]">
                {isAr ? "ضيف" : "Walk-in"}
              </Badge>
            ) : null}
            {sportLabel ? (
              <Badge variant="outline" className="rounded-full text-[11px]">
                {sportLabel}
              </Badge>
            ) : null}
          </>
        }
      />

      <BookingDetailsBody>
        <BookingDetailsPlayerCard
          language={language}
          name={playerInfo.name}
          phone={playerInfo.phone}
          email={playerInfo.email}
          copyLabel={copyLabel}
          onCopyPhone={() => {
            void navigator.clipboard.writeText(playerInfo.phone)
            toast.success(isAr ? "تم النسخ" : "Copied")
          }}
          avatar={
            <Avatar className="h-11 w-11 shrink-0 ring-1 ring-border/60">
              <AvatarImage src={playerInfo.avatar} />
              <AvatarFallback className="bg-primary/10 text-primary">{playerInfo.name.charAt(0)}</AvatarFallback>
            </Avatar>
          }
        />

        <BookingDetailsSection title={isAr ? "الموعد" : "Schedule"}>
          <BookingDetailsRow
            icon={<CalendarDays className="h-4 w-4" />}
            label={isAr ? "التاريخ" : "Date"}
            value={formatDate(booking.date)}
          />
          <BookingDetailsRow
            icon={<Clock className="h-4 w-4" />}
            label={isAr ? "الوقت" : "Time"}
            value={`${format12h(booking.startTime, language)} – ${format12h(booking.endTime, language)}`}
          />
          <BookingDetailsRow
            icon={<Clock className="h-4 w-4" />}
            label={isAr ? "المدة" : "Duration"}
            value={`${booking.duration || 1} ${isAr ? "ساعة" : "hr"}`}
          />
        </BookingDetailsSection>

        <BookingDetailsSection title={isAr ? "الملعب" : "Court"}>
          <BookingDetailsRow
            icon={<Building2 className="h-4 w-4" />}
            label={isAr ? "الملعب" : "Court"}
            value={courtInfo.name}
          />
          <BookingDetailsRow
            icon={<MapPin className="h-4 w-4" />}
            label={isAr ? "الموقع" : "Location"}
            value={`${courtInfo.city} · ${courtInfo.address}`}
          />
        </BookingDetailsSection>

        {booking.checkInCode ? (
          <BookingDetailsSection title={isAr ? "رمز الحضور" : "Check-in code"}>
            <BookingDetailsRow
              icon={<Hash className="h-4 w-4" />}
              label={isAr ? "الرمز" : "Code"}
              value={
                <span className="font-mono text-lg tracking-widest">{booking.checkInCode}</span>
              }
              onAction={() => {
                void navigator.clipboard.writeText(booking.checkInCode || "")
                toast.success(isAr ? "تم النسخ" : "Copied")
              }}
              actionLabel={copyLabel}
            />
          </BookingDetailsSection>
        ) : null}

        {hasBookingNote(booking.notes) ? (
          <BookingDetailsSection title={isAr ? "ملاحظة" : "Note"}>
            <div className="px-3.5 py-3">
              <BookingNotePanel note={booking.notes} language={language} className="border-0 bg-transparent p-0" />
            </div>
          </BookingDetailsSection>
        ) : null}
      </BookingDetailsBody>
    </BookingDetailsShell>
  )
})
