"use client"

import { memo, useCallback } from "react"
import {
  Eye,
  MoreHorizontal,
  Clock,
  MapPin,
  Ban,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  RotateCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import type { Booking } from "@/lib/types"
import { isCheckedInBooking, isNoShowBooking, getBookingDisplayStatus, getStatusBadgeVariant, isWalkInBooking } from "@/hooks/use-bookings-data"
import { BookingNotePopoverButton } from "./booking-note"
import { EmptyState, format12h } from "./shared"

interface BookingTableViewProps {
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
  sortBy: string
  onSortByChange: (value: string) => void
  t: (key: string) => string
}

export const BookingTableView = memo(function BookingTableView({
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
  sortBy,
  onSortByChange,
  t,
}: BookingTableViewProps) {
  const SortHeaderButton = useCallback(({
    label,
    target,
  }: {
    label: string
    target: "date" | "price" | "player"
  }) => {
    const handle = () => {
      if (target === "date") onSortByChange(sortBy === "date_desc" ? "date_asc" : "date_desc")
      if (target === "price") onSortByChange(sortBy === "price_desc" ? "price_asc" : "price_desc")
      if (target === "player") onSortByChange("player_asc")
    }

    const active =
      (target === "date" && (sortBy === "date_desc" || sortBy === "date_asc")) ||
      (target === "price" && (sortBy === "price_desc" || sortBy === "price_asc")) ||
      (target === "player" && sortBy === "player_asc")

    return (
      <button
        type="button"
        onClick={handle}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium transition",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-60")} />
      </button>
    )
  }, [sortBy, onSortByChange])

  return (
    <div key="table">
      <div className="relative overflow-x-visible rounded-2xl rounded-t-none border border-border/60 border-t-0 bg-background/45">
        <Table>
          <TableHeader className="bg-muted/25">
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <SortHeaderButton label={language === "ar" ? "اللاعب" : "Player"} target="player" />
              </TableHead>
              <TableHead>{language === "ar" ? "الملعب" : "Court"}</TableHead>
              <TableHead>
                <SortHeaderButton label={language === "ar" ? "التاريخ" : "Date"} target="date" />
              </TableHead>
              <TableHead>{language === "ar" ? "الوقت" : "Time"}</TableHead>
              <TableHead>
                <SortHeaderButton label={language === "ar" ? "المبلغ" : "Amount"} target="price" />
              </TableHead>
              <TableHead>{language === "ar" ? "الحالة" : "Status"}</TableHead>
              <TableHead>{language === "ar" ? "الحضور" : "Check-in"}</TableHead>
              <TableHead className="md:sticky md:ltr:right-0 md:rtl:left-0 md:z-10 md:bg-background md:w-[92px] md:min-w-[92px] md:ltr:border-l md:rtl:border-r md:border-border/60 text-end">
                {language === "ar" ? "إجراءات" : "Actions"}
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState
                    icon={<CalendarDays className="h-8 w-8 text-muted-foreground" />}
                    title={language === "ar" ? "لا توجد حجوزات" : "No bookings found"}
                    description={
                      language === "ar"
                        ? "جرّب تغيير الفلاتر أو البحث بكلمة أخرى"
                        : "Try changing filters or searching with a different keyword"
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((booking) => {
                const playerInfo = getPlayerInfo(booking)
                const courtInfo = getCourtInfo(booking)
                const isToday = booking.date === todayISO
                const displayStatus = getBookingDisplayStatus(booking)
                const isWalkInGuest = isWalkInBooking(booking)

                return (
                  <TableRow
                    key={booking.id}
                    className={cn(
                      "transition-colors hover:bg-primary/5 cursor-pointer active:scale-[0.99] origin-center group/row",
                      isToday && "border-l-4 border-l-primary"
                    )}
                    onClick={() => onViewDetails(booking)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 ring-1 ring-border/60 shrink-0">
                          <AvatarImage src={playerInfo.avatar} />
                          <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs uppercase">
                            {playerInfo.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{playerInfo.name}</p>
                          {isWalkInGuest ? (
                            <Badge variant="outline" className="mt-1 rounded-xl border-warning/40 bg-warning/10 text-warning">
                              {language === "ar" ? "ضيف حجز يدوي" : "Walk-in guest"}
                            </Badge>
                          ) : null}
                          <p className="text-xs text-muted-foreground truncate">{playerInfo.phone}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate">{courtInfo.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3" />
                          {courtInfo.city}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{formatDate(booking.date)}</p>
                        {isToday && (
                          <Badge variant="outline" className="text-[11px] mt-1 rounded-xl bg-background/60">
                            {language === "ar" ? "اليوم" : "Today"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono">
                            {format12h(booking.startTime, language)} - {format12h(booking.endTime, language)}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                          {t("common.egp")}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {Number(booking.totalPrice ?? booking.amount ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <StatusBadge variant={getStatusBadgeVariant(displayStatus)} dot>
                        {getStatusLabel(displayStatus)}
                      </StatusBadge>
                    </TableCell>

                    <TableCell>
                      {isCheckedInBooking(booking) ? (
                        <Badge
                          variant="outline"
                          className="bg-success/10 border-success/40 text-success rounded-xl"
                        >
                          <CheckCircle2 className="h-3 w-3 me-1" />
                          {language === "ar" ? "حاضر" : "Checked In"}
                        </Badge>
                      ) : isNoShowBooking(booking) ? (
                        <Badge
                          variant="outline"
                          className="bg-destructive/10 border-destructive/40 text-destructive rounded-xl"
                        >
                          <AlertCircle className="h-3 w-3 me-1" />
                          {language === "ar" ? "لم يحضر" : "Missed booking"}
                        </Badge>
                      ) : booking.status === "confirmed" ? (
                        booking.windowState === "late" ? (
                          <Badge
                            variant="outline"
                            className="bg-destructive/10 border-destructive/40 text-destructive rounded-xl"
                          >
                            <AlertCircle className="h-3 w-3 me-1" />
                            {language === "ar" ? "لم يحضر" : "Missed booking"}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-warning/10 border-warning/40 text-warning rounded-xl"
                          >
                            {language === "ar" ? "بانتظار تسجيل الحضور" : "Waiting to check in"}
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="md:sticky md:ltr:right-0 md:rtl:left-0 md:z-10 md:bg-background md:w-[92px] md:min-w-[92px] md:ltr:border-l md:rtl:border-r md:border-border/60 text-end">
                      <div className="inline-flex items-center gap-1">
                        <div onClick={(e) => e.stopPropagation()}>
                          <BookingNotePopoverButton
                            note={booking.notes}
                            language={language}
                            align={language === "ar" ? "start" : "end"}
                            iconOnly
                            className="h-8 w-8 rounded-xl"
                          />
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="rounded-2xl">
                              <DropdownMenuItem onClick={() => onViewDetails(booking)}>
                                <Eye className="me-2 h-4 w-4" />
                                {language === "ar" ? "عرض التفاصيل" : "View Details"}
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {booking.status === "confirmed" && (
                                <DropdownMenuItem
                                  onClick={() => onBookingAction(booking, "cancel")}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Ban className="me-2 h-4 w-4" />
                                  {language === "ar" ? "إلغاء الحجز" : "Cancel Booking"}
                                </DropdownMenuItem>
                              )}

                              {booking.paymentStatus === "paid" && (
                                <DropdownMenuItem
                                  onClick={() => onBookingAction(booking, "refund")}
                                  className="text-amber-600 dark:text-amber-400 focus:text-amber-600 font-medium"
                                >
                                  <RotateCcw className="me-2 h-4 w-4" />
                                  {language === "ar" ? "إصدار استرداد مالي" : "Issue Refund"}
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-3 p-3 border-t border-border/60 bg-background/45 rounded-b-2xl">
          <div className="text-sm text-muted-foreground">
            {language === "ar" ? "صفحة" : "Page"} {page} {language === "ar" ? "من" : "of"} {totalPages}
          </div>
          <div className="inline-flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              {language === "ar" ? "السابق" : "Previous"}
            </Button>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              {language === "ar" ? "التالي" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})
