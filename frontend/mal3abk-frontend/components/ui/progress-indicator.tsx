"use client"

import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

interface ProgressIndicatorProps {
  value: number
  max?: number
  size?: "sm" | "md" | "lg"
  variant?: "primary" | "success" | "warning" | "destructive"
  showLabel?: boolean
  animated?: boolean
}

const variantClasses = (isRTL: boolean) => ({
  primary: isRTL ? "bg-gradient-to-l from-primary to-emerald-500" : "bg-gradient-to-r from-primary to-emerald-500",
  success: isRTL ? "bg-gradient-to-l from-emerald-500 to-teal-600" : "bg-gradient-to-r from-emerald-500 to-teal-600",
  warning: isRTL ? "bg-gradient-to-l from-amber-500 to-orange-600" : "bg-gradient-to-r from-amber-500 to-orange-600",
  destructive: isRTL ? "bg-gradient-to-l from-rose-500 to-pink-600" : "bg-gradient-to-r from-rose-500 to-pink-600",
})

const sizeClasses = {
  sm: "h-2",
  md: "h-3",
  lg: "h-4",
}

export function ProgressIndicator({
  value,
  max = 100,
  size = "md",
  variant = "primary",
  showLabel = false,
  animated = true,
}: ProgressIndicatorProps) {
  const { language } = useLanguage()
  const isRTL = language === "ar"
  const percentage = Math.min((value / max) * 100, 100)

  return (
    <div className="w-full space-y-2" dir={isRTL ? "rtl" : "ltr"}>
      <div className={cn("w-full rounded-full bg-muted/50 overflow-hidden", sizeClasses[size])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            variantClasses(isRTL)[variant],
            animated && "shadow-glow-sm",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{value}</span>
          <span className="text-muted-foreground">{max}</span>
        </div>
      )}
    </div>
  )
}

