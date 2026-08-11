"use client"

import { useLanguage } from "@/components/providers/language-provider"
import { normalizeBookingStatus } from "@/hooks/use-bookings-data"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { parseISODateLocal } from "@/lib/date"

interface BookingData {
  id: string
  courtId?: string
  courtName?: string
  courtNameEn?: string
  playerId?: string
  playerName?: string
  playerNameEn?: string
  date: string | Date
  startTime?: string
  endTime?: string
  status: string
  amount?: number
}

interface RecentBookingsTableProps {
  data?: BookingData[] // Made data optional with default
}

const statusColors: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-success/10 text-success border-success/20",
  no_show: "bg-destructive/10 text-destructive border-destructive/20",
}

export function RecentBookingsTable({ data }: RecentBookingsTableProps) {
  const { language, t } = useLanguage()

const bookings = data || []
  const getStatusLabel = (status: string) => {
    const labels: Record<string, { ar: string; en: string }> = {
      confirmed: { ar: "مؤكد", en: "Confirmed" },
      cancelled: { ar: "ملغي", en: "Cancelled" },
      completed: { ar: "مكتمل", en: "Completed" },
      no_show: { ar: "لم يحضر", en: "Missed booking" },
    }
    const normalizedStatus = normalizeBookingStatus(status)
    return labels[normalizedStatus]?.[language] || normalizedStatus
  }

  const formatDate = (date: string | Date) => {
    const dateObj =
      typeof date === "string"
        ? /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? parseISODateLocal(date)
          : new Date(date)
        : date

    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
      day: "numeric",
      month: "short",
    }).format(dateObj)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{language === "ar" ? "اللاعب" : "Player"}</TableHead>
          <TableHead>{language === "ar" ? "الملعب" : "Court"}</TableHead>
          <TableHead className="text-center">{t("common.date")}</TableHead>
          <TableHead className="text-center">{t("bookings.status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((booking) => (
          <TableRow key={booking.id}>
            <TableCell className="font-medium">{booking.playerName || "N/A"}</TableCell>
            <TableCell className="text-muted-foreground">
              {language === "ar" ? booking.courtName : booking.courtNameEn || booking.courtName}
            </TableCell>
            <TableCell className="text-center">{formatDate(booking.date)}</TableCell>
            <TableCell className="text-center">
              <Badge variant="outline" className={statusColors[normalizeBookingStatus(booking.status)] || statusColors.confirmed}>
                {getStatusLabel(booking.status)}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
