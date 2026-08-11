"use client"

import { memo } from "react"
import {
  Eye,
  MoreHorizontal,
  Clock,
  MapPin,
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import type { Booking } from "@/lib/types"
import { isCheckedInBooking, getBookingDisplayStatus, getStatusBadgeVariant, isWalkInBooking } from "@/hooks/use-bookings-data"
import { BookingNotePopoverButton } from "./booking-note"
import { EmptyState, format12h } from "./shared"

interface BookingListViewProps {
  bookings: Booking[]
  language: string
  todayISO: string
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  getPlayerInfo: (booking: Booking) => { id?: string; name: string; phone: string; email: string; avatar?: string }
  getCourtInfo: (booking: Booking) => { name: string; city: string }
  getStatusLabel: (status: string) => string
  formatDate: (date: string | Date) => string
  onViewDetails: (booking: Booking) => void
  onBookingAction: (booking: Booking, action: string) => void
  t: (key: string) => string
}

const copy = {
  ar: {
    emptyTitle: "\u0644\u0627 \u062a\u0648\u062c\u062f \u062d\u062c\u0648\u0632\u0627\u062a",
    emptyDescription: "\u063a\u064a\u0651\u0631 \u0627\u0644\u0641\u0644\u0627\u062a\u0631 \u0623\u0648 \u0627\u0628\u062d\u062b \u0628\u0627\u0633\u0645 \u0627\u0644\u0644\u0627\u0639\u0628",
    checkedIn: "\u062d\u0627\u0636\u0631",
    missed: "\u0644\u0645 \u064a\u062d\u0636\u0631",
    today: "\u0627\u0644\u064a\u0648\u0645",
    details: "\u062a\u0641\u0627\u0635\u064a\u0644",
    viewDetails: "\u0639\u0631\u0636 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644",
    cancelBooking: "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u062d\u062c\u0632",
    page: "\u0635\u0641\u062d\u0629",
    of: "\u0645\u0646",
    previous: "\u0627\u0644\u0633\u0627\u0628\u0642",
    next: "\u0627\u0644\u062a\u0627\u0644\u064a",
  },
  en: {
    emptyTitle: "No bookings",
    emptyDescription: "Change filters or search by player name",
    checkedIn: "Checked In",
    missed: "Missed booking",
    today: "Today",
    details: "Details",
    viewDetails: "View Details",
    cancelBooking: "Cancel Booking",
    page: "Page",
    of: "of",
    previous: "Previous",
    next: "Next",
  },
} as const

export const BookingListView = memo(function BookingListView({
  bookings,
  language,
  todayISO,
  page,
  totalPages,
  onPageChange,
  getPlayerInfo,
  getCourtInfo,
  getStatusLabel,
  formatDate,
  onViewDetails,
  onBookingAction,
  t,
}: BookingListViewProps) {
  const text = language === "ar" ? copy.ar : copy.en

  return (
    <div className="mobile-render-list space-y-2.5">
      {bookings.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-muted-foreground" />}
          title={text.emptyTitle}
          description={text.emptyDescription}
        />
      ) : (
        bookings.map((booking) => {
          const playerInfo = getPlayerInfo(booking)
          const courtInfo = getCourtInfo(booking)
          const isToday = booking.date === todayISO
          const isWalkInGuest = isWalkInBooking(booking)

          return (
            <div key={booking.id}>
              <Card
                className={cn(
                  "mobile-render-card cursor-pointer rounded-2xl border-border/60 bg-card shadow-sm transition-colors hover:bg-muted/30 active:scale-[0.99]",
                  isToday && "ring-1 ring-primary/25",
                )}
                onClick={() => onViewDetails(booking)}
              >
                <CardContent className="p-3.5 sm:p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar className="h-11 w-11 shrink-0 ring-1 ring-border/60">
                          <AvatarImage src={playerInfo.avatar} />
                          <AvatarFallback className="bg-primary/15 text-sm font-bold uppercase text-primary">
                            {playerInfo.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[1.05rem] font-semibold text-foreground">{playerInfo.name}</p>
                            {isToday ? (
                              <Badge variant="outline" className="rounded-full border-border/60 bg-background/70 px-2.5 py-0.5 text-[11px]">
                                {text.today}
                              </Badge>
                            ) : null}
                            {isWalkInGuest ? (
                              <Badge variant="outline" className="rounded-full border-warning/40 bg-warning/10 px-2.5 py-0.5 text-[11px] text-warning">
                                {language === "ar" ? "ضيف حجز يدوي" : "Walk-in guest"}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge variant={getStatusBadgeVariant(getBookingDisplayStatus(booking))} dot>
                              {getStatusLabel(getBookingDisplayStatus(booking))}
                            </StatusBadge>

                            {isCheckedInBooking(booking) ? (
                              <Badge variant="outline" className="rounded-full border-success/40 bg-success/10 text-success">
                                <CheckCircle2 className="me-1 h-3 w-3" />
                                {text.checkedIn}
                              </Badge>
                            ) : booking.status === "confirmed" && booking.windowState === "late" ? (
                              <Badge variant="outline" className="rounded-full border-destructive/40 bg-destructive/10 text-destructive">
                                <AlertCircle className="me-1 h-3 w-3" />
                                {text.missed}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start">
                        <div onClick={(e) => e.stopPropagation()}>
                          <BookingNotePopoverButton
                            note={booking.notes}
                            language={language}
                            align={language === "ar" ? "start" : "end"}
                            iconOnly
                            className="h-9 w-9 rounded-xl"
                          />
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-2xl">
                              <DropdownMenuItem onClick={() => onViewDetails(booking)}>
                                <Eye className="me-2 h-4 w-4" />
                                {text.viewDetails}
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {booking.status === "confirmed" ? (
                                <DropdownMenuItem
                                  onClick={() => onBookingAction(booking, "cancel")}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Ban className="me-2 h-4 w-4" />
                                  {text.cancelBooking}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2.5 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2.5">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0 leading-6">{courtInfo.name}</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0 leading-6">{formatDate(booking.date)}</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="font-mono leading-6">
                          {format12h(booking.startTime, language)} - {format12h(booking.endTime, language)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 border-t border-border/50 pt-2.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-xs font-semibold tabular-nums">
                          <span className="rounded-full border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                            {t("common.egp")}
                          </span>
                          <span>{Number(booking.totalPrice ?? booking.amount ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{courtInfo.city}</span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 rounded-xl px-2.5 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewDetails(booking)
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="ms-1.5">{text.details}</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-sm text-muted-foreground">
          {text.page} {page} {text.of} {totalPages}
        </div>
        <div className="inline-flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            {text.previous}
          </Button>
          <Button
            size="sm"
            className="rounded-xl"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            {text.next}
          </Button>
        </div>
      </div>
    </div>
  )
})
