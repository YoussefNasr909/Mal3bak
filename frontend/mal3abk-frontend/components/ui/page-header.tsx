"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PageTransition } from "@/components/ui/page-transition"

import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  breadcrumbs?: BreadcrumbItem[]
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  breadcrumbs,
}: PageHeaderProps) {
  const { language } = useLanguage()
  const isRTL = language === "ar"

  return (
    <PageTransition>
      <div className={cn("space-y-4", className)}>
        <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 space-y-1 sm:space-y-1.5">
            <div className="absolute -inset-x-6 -top-6 h-20 rounded-full bg-linear-to-r from-primary/10 via-primary/5 to-transparent blur-2xl pointer-events-none -z-10" />

            <h1
              className={cn(
                "text-2xl sm:text-3xl font-extrabold text-foreground",
                isRTL ? "leading-snug" : "tracking-tight",
              )}
            >
              {title}
            </h1>
            {description && (
              <p className="text-[15px] font-medium text-muted-foreground/80 mt-1 max-w-xl leading-relaxed">{description}</p>
            )}
          </div>

          {actions && (
            <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
              {actions}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  )
}

