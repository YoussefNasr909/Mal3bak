"use client"

import type { ReactNode } from "react"
import { isValidElement } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Stat card used on the bookings page header */
export function StatCard({
  icon,
  label,
  value,
  subLabel,
  tone = "primary",
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  subLabel?: ReactNode
  tone?: "primary" | "success" | "warning" | "destructive" | "info"
}) {
  const tones =
    {
      primary: "from-primary/12 to-primary/5 border-primary/15",
      success: "from-success/12 to-success/5 border-success/15",
      warning: "from-warning/12 to-warning/5 border-warning/15",
      destructive: "from-destructive/12 to-destructive/5 border-destructive/15",
      info: "from-info/12 to-info/5 border-info/15",
    }[tone] ?? "from-primary/12 to-primary/5 border-primary/15"

  return (
    <Card className={cn("relative overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm", tones)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
              {subLabel ? <div className="mt-1 text-[11px] font-medium">{subLabel}</div> : null}
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/60 ring-1 ring-border/60">
              {icon}
            </div>
          </div>
        </CardContent>
    </Card>
  )
}

/** Filter pill / chip */
export function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
}) {
  const labelText = getNodeText(children)
  if (labelText.includes("Completed") || labelText.includes("مكتمل")) {
    return null
  }

  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        "bg-muted/50 hover:bg-muted",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}

/** Empty state with icon, title, description */
export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 border border-border/60">
        {icon}
      </div>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

/** Recursively extract text from React node tree */
export function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join(" ")
  if (isValidElement(node)) return getNodeText((node.props as { children?: ReactNode }).children)
  return ""
}

/** CSV cell escaper */
export const csvEscape = (value: unknown) => {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Format time as 12h with AM/PM */
export function format12h(time: string, lang: string) {
  if (!time) return ""
  const [hh, mm] = time.split(":").map(Number)
  const ampm = hh >= 12 ? (lang === "ar" ? "م" : "PM") : (lang === "ar" ? "ص" : "AM")
  const h12 = hh % 12 || 12
  return `\u200E${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ampm}`
}
