"use client"
import { Check, AlertCircle, Info, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToastProps {
  message: string
  type?: "success" | "error" | "info" | "warning"
  description?: string
  duration?: number
}

const toastVariants = {
  success: {
    bg: "bg-emerald-500/10 border-emerald-500/20",
    icon: Check,
    textColor: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    bg: "bg-destructive/10 border-destructive/20",
    icon: AlertCircle,
    textColor: "text-destructive",
  },
  info: {
    bg: "bg-blue-500/10 border-blue-500/20",
    icon: Info,
    textColor: "text-blue-600 dark:text-blue-400",
  },
  warning: {
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: AlertTriangle,
    textColor: "text-amber-600 dark:text-amber-400",
  },
}

export function EnhancedToast({ message, type = "info", description, duration = 3000 }: ToastProps) {
  const variant = toastVariants[type]
  const Icon = variant.icon

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-4 backdrop-blur-sm", variant.bg)}>
      <Icon className={cn("h-5 w-5 flex-shrink-0", variant.textColor)} />
      <div>
        <p className={cn("font-medium", variant.textColor)}>{message}</p>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
    </div>
  )
}

