"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function DashboardStatCard({
  icon,
  label,
  value,
  subLabel,
  tone = "primary",
  href,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  subLabel?: ReactNode
  tone?: "primary" | "success" | "warning" | "destructive" | "info"
  href?: string
}) {
  const tones =
    {
      primary: "from-primary/12 to-primary/5 border-primary/15",
      success: "from-success/12 to-success/5 border-success/15",
      warning: "from-warning/12 to-warning/5 border-warning/15",
      destructive: "from-destructive/12 to-destructive/5 border-destructive/15",
      info: "from-info/12 to-info/5 border-info/15",
    }[tone] ?? "from-primary/12 to-primary/5 border-primary/15"

  const card = (
    <Card className={cn("h-full overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm", tones)}>
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">{label}</p>
            <p className="mt-1 text-xl font-black tabular-nums tracking-tight sm:text-2xl">{value}</p>
            {subLabel ? (
              <p className="mt-1 line-clamp-2 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                {subLabel}
              </p>
            ) : null}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70 ring-1 ring-border/60 sm:h-10 sm:w-10">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    )
  }

  return card
}

export function DashboardStatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">{children}</div>
}
