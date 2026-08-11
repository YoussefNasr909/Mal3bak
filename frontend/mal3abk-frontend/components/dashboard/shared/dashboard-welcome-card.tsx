"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export type DashboardWelcomeBadge = {
  label: string
}

export function DashboardWelcomeCard({
  title,
  description,
  detail,
  badges,
  action,
  className,
}: {
  title: string
  description: string
  detail?: string
  badges?: DashboardWelcomeBadge[]
  action?: {
    label: string
    href: string
    icon?: ReactNode
  }
  className?: string
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-primary/6 via-card to-card shadow-sm",
        className,
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              {detail ? (
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground/90 sm:text-sm">
                  {detail}
                </p>
              ) : null}
            </div>
            {badges && badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {badges.map((badge) => (
                  <Badge key={badge.label} variant="secondary" className="rounded-full text-[11px] font-medium">
                    {badge.label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          {action ? (
            <Button size="sm" className="h-10 shrink-0 rounded-xl" asChild>
              <Link href={action.href}>
                {action.icon}
                {action.label}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
