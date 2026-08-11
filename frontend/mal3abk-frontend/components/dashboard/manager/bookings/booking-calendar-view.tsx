"use client"

import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import {
  Eye,
  Clock,
  MapPin,
  Calendar,
  Building2,
  CheckCircle2,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import type { Booking } from "@/lib/types"
import { isCheckedInBooking, getBookingDisplayStatus, getStatusBadgeVariant } from "@/hooks/use-bookings-data"
import { EmptyState, format12h } from "./shared"
import { createEgyptDate } from "@/lib/date"

const asDay = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number)
  return createEgyptDate(y, m, d, 12, 0)
}

interface BookingCalendarViewProps {
  bookings: Booking[]
  language: string
  sortBy: string
  getPlayerInfo: (booking: Booking) => { id?: string; name: string; phone: string; email: string; avatar?: string }
  getCourtInfo: (booking: Booking) => { name: string; city: string }
  getStatusLabel: (status: string) => string
  formatDate: (date: string | Date) => string
  onViewDetails: (booking: Booking) => void
  t: (key: string) => string
}

export const BookingCalendarView = memo(function BookingCalendarView({
  bookings,
  language,
  sortBy,
  getPlayerInfo,
  getCourtInfo,
  getStatusLabel,
  formatDate,
  onViewDetails,
  t,
}: BookingCalendarViewProps) {
  const groupedByDate = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of bookings) {
      const key = b.date
      map.set(key, [...(map.get(key) || []), b])
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (sortBy === "date_asc") return asDay(a).getTime() - asDay(b).getTime()
      return asDay(b).getTime() - asDay(a).getTime()
    })
    return keys.map((k) => ({ date: k, items: map.get(k)! }))
  }, [bookings, sortBy])

  return (
    <motion.div
      key="calendar"
      initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="space-y-4"
    >
      {groupedByDate.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-8 w-8 text-muted-foreground" />}
          title={language === "ar" ? "لا توجد حجوزات" : "No bookings"}
          description={language === "ar" ? "اختر فترة مختلفة أو حالة أخرى" : "Try a different date range or status"}
        />
      ) : (
        groupedByDate.map((group) => (
          <Card key={group.date} className="rounded-2xl border-border/60 bg-background/45">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{formatDate(group.date)}</span>
                <Badge variant="outline" className="rounded-xl bg-background/60 border-border/60">
                  {group.items.length} {language === "ar" ? "حجز" : "bookings"}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-0 space-y-2">
              {group.items.map((booking) => {
                const playerInfo = getPlayerInfo(booking)
                const courtInfo = getCourtInfo(booking)

                return (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/55 p-3 cursor-pointer hover:bg-primary/5 active:scale-[0.98] transition-all"
                    onClick={() => onViewDetails(booking)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 ring-1 ring-border/60">
                        <AvatarImage src={playerInfo.avatar} />
                        <AvatarFallback>{playerInfo.name.charAt(0)}</AvatarFallback>
                      </Avatar>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">{playerInfo.name}</p>
                          <StatusBadge variant={getStatusBadgeVariant(getBookingDisplayStatus(booking))} dot>
                            {getStatusLabel(getBookingDisplayStatus(booking))}
                          </StatusBadge>
                        </div>

                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" /> {courtInfo.name}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Clock className="h-3.5 w-3.5" /> {format12h(booking.startTime, language)}-{format12h(booking.endTime, language)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {courtInfo.city}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {Number(booking.totalPrice ?? booking.amount ?? 0).toLocaleString()}{" "}
                          <span className="text-xs text-muted-foreground">{t("common.egp")}</span>
                        </div>
                        {isCheckedInBooking(booking) ? (
                          <div className="text-xs text-success flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {language === "ar" ? "حاضر" : "Checked In"}
                          </div>
                        ) : null}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-2xl border-border/60 bg-background/60 hover:bg-background/80"
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewDetails(booking)
                        }}
                      >
                        <Eye className="me-2 h-4 w-4" />
                        {language === "ar" ? "تفاصيل" : "Details"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))
      )}
    </motion.div>
  )
})
