"use client"

import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"

interface EnhancedStatProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: ReactNode
  trend?: "up" | "down" | "neutral"
  sparkline?: number[]
  onClick?: () => void
}

export function EnhancedStat({
  title,
  value,
  change,
  changeLabel,
  icon,
  trend = "neutral",
  sparkline,
  onClick,
}: EnhancedStatProps) {
  const trendColor =
    trend === "up" ? "text-emerald-500" : trend === "down" ? "text-destructive" : "text-muted-foreground"
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown

  return (
    <Card
      className="group relative overflow-hidden border-2 border-border/50 p-6 cursor-pointer transition-all duration-700 hover:shadow-smooth-lg hover:-translate-y-2 hover:border-primary/50 bg-card/60 backdrop-blur-sm hover:bg-card/90"
      onClick={onClick}
    >
      {/* Enhanced background decorations */}
      <div className="absolute -end-12 -top-12 h-32 w-32 rounded-full bg-primary/8 transition-all duration-1000 group-hover:scale-150 group-hover:opacity-100 opacity-50" />
      <div className="absolute -start-8 -bottom-8 h-24 w-24 rounded-full bg-info/5 transition-all duration-1000 group-hover:scale-125 opacity-0 group-hover:opacity-100" />

      {/* Animated border glow */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-primary/10 via-transparent to-info/10 blur-xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">{title}</p>
            <p className="text-4xl font-extrabold text-foreground mt-2 bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
              {value}
            </p>
          </div>
          {icon && (
            <div className="flex-shrink-0 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">
              {icon}
            </div>
          )}
        </div>

        {change !== undefined && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 group-hover:bg-primary/10 transition-colors duration-300">
              <TrendIcon className={cn("h-4 w-4", trendColor)} />
              <span className={cn("text-sm font-bold", trendColor)}>{Math.abs(change)}%</span>
            </div>
            {changeLabel && <span className="text-xs text-muted-foreground font-medium">{changeLabel}</span>}
          </div>
        )}

        {sparkline && sparkline.length > 0 && (
          <div className="mt-5 flex items-end gap-1 h-10">
            {sparkline.map((value, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-primary/40 to-primary/20 rounded-t transition-all duration-500 group-hover:from-primary/60 group-hover:to-primary/30 group-hover:scale-110"
                style={{ height: `${(value / Math.max(...sparkline)) * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Enhanced hover glow effect */}
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none -z-10 blur-3xl bg-primary/20" />

      {/* Bottom accent line */}
      <div className="absolute bottom-0 start-0 end-0 h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </Card>
  )
}

