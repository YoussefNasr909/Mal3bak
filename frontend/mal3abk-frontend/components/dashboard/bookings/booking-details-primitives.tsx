"use client"

import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const shellClassName =
  "flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-3xl border-0 p-0 sm:max-w-lg sm:rounded-3xl w-[calc(100vw-1rem)] sm:w-full"

export function BookingDetailsShell({
  open,
  onOpenChange,
  children,
  footer,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  footer?: ReactNode
  title: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={shellClassName} showCloseButton>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
        {footer ? (
          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/50 bg-card px-4 py-3 sm:flex-row sm:px-5">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function BookingDetailsHero({
  title,
  subtitle,
  badges,
  amount,
  amountSuffix,
}: {
  title: string
  subtitle?: string
  badges?: ReactNode
  amount?: ReactNode
  amountSuffix?: string
}) {
  const hasFooterRow = Boolean(badges) || amount != null

  return (
    <div className="shrink-0 border-b border-border/50 bg-muted/20 px-4 pb-4 pt-4 pe-11 sm:px-5 sm:pe-12">
      <div className="space-y-2">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-bold leading-tight tracking-tight">{title}</h2>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {hasFooterRow ? (
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            {badges ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{badges}</div> : <span />}
            {amount != null ? (
              <div className="ms-auto shrink-0 text-end">
                <p className="text-xl font-black tabular-nums leading-none text-primary">{amount}</p>
                {amountSuffix ? (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {amountSuffix}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function BookingDetailsBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
      {children}
    </div>
  )
}

export function BookingDetailsSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card divide-y divide-border/50">
        {children}
      </div>
    </section>
  )
}

export function BookingDetailsRow({
  icon,
  label,
  value,
  href,
  onAction,
  actionLabel,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  href?: string
  onAction?: () => void
  actionLabel?: string
}) {
  const valueNode = href ? (
    <a href={href} className="font-semibold text-foreground underline-offset-2 hover:underline">
      {value}
    </a>
  ) : (
    <div className="font-semibold text-foreground break-words">{value}</div>
  )

  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {valueNode}
      </div>
      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 text-xs font-semibold text-primary"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function BookingDetailsPlayerCard({
  avatar,
  name,
  meta,
  phone,
  email,
  copyLabel,
  onCopyPhone,
  language,
}: {
  avatar: ReactNode
  name: string
  meta?: ReactNode
  phone: string
  email: string
  copyLabel: string
  onCopyPhone: () => void
  language: string
}) {
  const phoneHref = phone && phone !== "—" ? `tel:${phone.replace(/\s/g, "")}` : undefined
  const mailHref = email && email !== "—" ? `mailto:${email}` : undefined

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-3.5">
      {avatar}
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="font-semibold leading-tight">{name}</p>
          {meta}
        </div>
        <div className="flex flex-wrap gap-2">
          {phoneHref ? (
            <a
              href={phoneHref}
              className={cn(
                "inline-flex items-center rounded-full bg-muted/60 px-3 py-1.5 text-xs font-semibold",
                language === "ar" && "font-sans",
              )}
            >
              {phone}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">{phone}</span>
          )}
          {mailHref ? (
            <a
              href={mailHref}
              className="inline-flex max-w-full truncate rounded-full bg-muted/60 px-3 py-1.5 text-xs font-semibold"
            >
              {email}
            </a>
          ) : null}
          {phone !== "—" ? (
            <button
              type="button"
              onClick={onCopyPhone}
              className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {copyLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
