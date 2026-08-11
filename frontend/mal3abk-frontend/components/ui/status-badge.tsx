"use client"

import type * as React from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors shadow-xs",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border border-border/30",
        success: "bg-success/15 text-success border border-success/25",
        warning: "bg-warning/15 text-warning-foreground border border-warning/25",
        destructive: "bg-destructive/15 text-destructive border border-destructive/25",
        info: "bg-info/15 text-info border border-info/25",
        primary: "bg-primary/15 text-primary border border-primary/25",
        outline: "border border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusBadgeVariants> {
  dot?: boolean
  pulse?: boolean
}

export function StatusBadge({ className, variant, dot = false, pulse = false, children, ...props }: StatusBadgeProps) {
  const dotColors = {
    default: "bg-secondary-foreground",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    info: "bg-info",
    primary: "bg-primary",
    outline: "bg-foreground",
  }

  return (
    <span className={cn(statusBadgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                dotColors[variant || "default"],
              )}
            />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColors[variant || "default"])} />
        </span>
      )}
      {children}
    </span>
  )
}

