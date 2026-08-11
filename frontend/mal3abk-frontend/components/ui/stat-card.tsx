"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  change?: number
  changeLabel?: string
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>
  iconColor?: string
  iconBg?: string
  className?: string
  variant?: "default" | "primary" | "success" | "warning" | "info"
  trend?: {
    value: number
    isPositive: boolean
  }
}

export function StatCard({
  title,
  value,
  subtitle,
  change,
  changeLabel,
  icon,
  iconColor,
  iconBg,
  className,
  variant = "default",
  trend,
}: StatCardProps) {
  const variants = {
    default: "bg-card",
    primary: "bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20",
    success: "bg-gradient-to-br from-success/10 to-success/5 border-success/20",
    warning: "bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20",
    info: "bg-gradient-to-br from-info/10 to-info/5 border-info/20",
  }

  const iconVariants = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/20 text-primary",
    success: "bg-success/20 text-success",
    warning: "bg-warning/20 text-warning",
    info: "bg-info/20 text-info",
  }

  const getTrendIcon = () => {
    if (trend) {
      return trend.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />
    }
    if (!change) return <Minus className="h-3 w-3" />
    return change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />
  }

  const getTrendColor = () => {
    if (trend) {
      return trend.isPositive ? "text-success" : "text-destructive"
    }
    if (!change) return "text-muted-foreground"
    return change > 0 ? "text-success" : "text-destructive"
  }

  const renderIcon = () => {
    if (!icon) return null

    // Check if icon is already a valid React element (rendered JSX like <Icon />)
    if (React.isValidElement(icon)) {
      return icon
    }

    // Handle component types (including forwardRef components like Lucide icons)
    // forwardRef components are objects with $$typeof, so we check if it can be used as a component
    const IconComponent = icon as React.ComponentType<{ className?: string }>
    if (IconComponent) {
      return <IconComponent className={cn("h-5 w-5", iconColor)} />
    }

    return null
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover-lift shadow-smooth",
        variants[variant],
        className,
      )}
    >
      {/* Background decoration */}
      <div className="absolute -end-8 -top-8 h-24 w-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-150" />

      <div className="relative flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {(change !== undefined || changeLabel || trend) && (
            <div className={cn("flex items-center gap-1.5 text-sm", getTrendColor())}>
              {getTrendIcon()}
              <span className="font-medium">
                {trend
                  ? `${trend.isPositive ? "+" : "-"}${Math.abs(trend.value)}%`
                  : change !== undefined
                    ? `${change > 0 ? "+" : ""}${change}%`
                    : ""}
              </span>
              {changeLabel && <span className="text-muted-foreground">{changeLabel}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "rounded-xl p-3 transition-transform duration-300 group-hover:scale-110",
              iconBg || iconVariants[variant],
            )}
          >
            {renderIcon()}
          </div>
        )}
      </div>
    </div>
  )
}

