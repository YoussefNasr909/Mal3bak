"use client"

import { memo, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface BookingStatsCardsProps {
  stats: {
    total: number
    checkedIn: number
    todayBookings: number
    noShow: number
  }
  language: string
  isLoading?: boolean
  headerTitle?: string
  description?: string
  actions?: ReactNode
}

export const BookingStatsCards = memo(function BookingStatsCards({
  stats,
  language,
  isLoading = false,
  headerTitle,
  description,
  actions,
}: BookingStatsCardsProps) {
  const isAr = language === "ar"
  const fallbackTitle = isAr ? "\u0627\u0644\u062d\u062c\u0648\u0632\u0627\u062a" : "Bookings"
  const displayTitle = headerTitle ?? fallbackTitle

  const items = [
    {
      key: "total",
      label: isAr ? "إجمالي" : "Total",
      value: stats.total,
      tone: "text-primary",
      tile: "border-primary/15 bg-gradient-to-b from-primary/12 to-primary/5",
    },
    {
      key: "checkedIn",
      label: isAr ? "تم الحضور" : "Checked in",
      value: stats.checkedIn,
      tone: "text-emerald-600 dark:text-emerald-400",
      tile: "border-emerald-500/15 bg-gradient-to-b from-emerald-500/12 to-emerald-500/5",
    },
    {
      key: "today",
      label: isAr ? "اليوم" : "Today",
      value: stats.todayBookings,
      tone: "text-sky-600 dark:text-sky-400",
      tile: "border-sky-500/15 bg-gradient-to-b from-sky-500/12 to-sky-500/5",
    },
    {
      key: "noShow",
      label: isAr ? "لم يحضر" : "No-show",
      value: stats.noShow,
      tone: "text-destructive",
      tile: "border-destructive/15 bg-gradient-to-b from-destructive/12 to-destructive/5",
    },
  ] as const

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-primary/8 via-card to-card shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-foreground sm:text-xl">{displayTitle}</h1>
              {isLoading && <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin text-primary" aria-hidden />}
            </div>
            {description ? (
              <p className="mt-1 max-w-xl text-sm font-medium leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-start justify-end">{actions}</div>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
          {items.map((item) => (
            <div
              key={item.key}
              className={cn(
                "min-w-0 rounded-2xl border px-2 py-2.5 text-center sm:px-2.5",
                item.tile,
              )}
            >
              <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-muted-foreground sm:text-[11px]">
                {item.label}
              </p>
              {isLoading ? (
                <Skeleton className="mx-auto mt-1.5 h-7 w-12 rounded-md" />
              ) : (
                <p
                  className={cn(
                    "mt-1 text-xl font-black tabular-nums leading-none sm:text-2xl",
                    item.tone,
                  )}
                >
                  {item.value.toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})
