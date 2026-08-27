"use client"

import { formatDistanceToNow } from "date-fns"
import { ar, enUS } from "date-fns/locale"
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Notification } from "@/lib/types"
import {
  getNotificationActionLabel,
  getNotificationGroupLabel,
  getNotificationPriorityLabel,
  groupNotifications,
} from "@/lib/notifications"
import { cn } from "@/lib/utils"

type NotificationListProps = {
  items: Notification[]
  language: "ar" | "en"
  direction: "rtl" | "ltr"
  loading?: boolean
  emptyTitle: string
  emptyDescription: string
  onOpenNotification: (notification: Notification) => void | Promise<void>
  onDeleteNotification?: (notification: Notification) => void | Promise<void>
  compact?: boolean
}

const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF]/
const MOJIBAKE_PATTERN = /[\u00C2\u00C3\u00D8\u00D9\uFFFD]/

function getNotificationIcon(notification: Notification) {
  if (notification.category === "booking") return CalendarDays
  if (notification.category === "tournament") return Trophy
  if (notification.type === "success") return CheckCircle2
  if (notification.type === "warning") return AlertTriangle
  if (notification.type === "error") return XCircle
  return Info
}

function isLikelyMojibake(value: string | null | undefined) {
  return typeof value === "string" && MOJIBAKE_PATTERN.test(value)
}

function repairArabicMojibake(value: string | null | undefined) {
  if (typeof value !== "string" || !value.length) {
    return ""
  }

  if (!isLikelyMojibake(value)) {
    return value
  }

  try {
    const bytes = Uint8Array.from(Array.from(value), (character) => character.charCodeAt(0) & 0xff)
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "").trim()

    return ARABIC_SCRIPT_PATTERN.test(repaired) ? repaired : value
  } catch {
    return value
  }
}

function getNotificationCopy(notification: Notification, language: "ar" | "en") {
  const normalizedArabicTitle = repairArabicMojibake(notification.titleAr)
  const normalizedArabicMessage = repairArabicMojibake(notification.messageAr)
  const hasArabicCopy =
    language === "ar" &&
    Boolean(normalizedArabicTitle) &&
    Boolean(normalizedArabicMessage) &&
    ARABIC_SCRIPT_PATTERN.test(`${normalizedArabicTitle}${normalizedArabicMessage}`)

  return {
    title: hasArabicCopy ? normalizedArabicTitle : notification.title,
    message: hasArabicCopy ? normalizedArabicMessage : notification.message,
    direction: hasArabicCopy ? "rtl" : "ltr",
  }
}

function getCategoryLabel(notification: Notification, language: "ar" | "en") {
  const labels = {
    booking: { ar: "\u062D\u062C\u0632", en: "Booking" },
    tournament: { ar: "\u0628\u0637\u0648\u0644\u0629", en: "Tournament" },
    account: { ar: "\u062D\u0633\u0627\u0628", en: "Account" },
    system: { ar: "\u0627\u0644\u0646\u0638\u0627\u0645", en: "System" },
    admin: { ar: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629", en: "Admin" },
  } as const

  return labels[notification.category][language]
}

function getTypeStyles(type: Notification["type"]) {
  if (type === "success") {
    return {
      container: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    }
  }

  if (type === "warning") {
    return {
      container: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    }
  }

  if (type === "error") {
    return {
      container: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
      badge: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    }
  }

  return {
    container: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    badge: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  }
}

function getPriorityBadgeStyles(priority: Notification["priority"]) {
  if (priority === "urgent") {
    return "border-rose-200 bg-rose-50 text-rose-700"
  }

  if (priority === "high") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  return "border-border/60 bg-background text-muted-foreground"
}

function NotificationSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-background/70 p-3",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  )
}

export function NotificationList({
  items,
  language,
  direction,
  loading = false,
  emptyTitle,
  emptyDescription,
  onOpenNotification,
  onDeleteNotification,
  compact = false,
}: NotificationListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <NotificationSkeleton compact={compact} />
        <NotificationSkeleton compact={compact} />
        <NotificationSkeleton compact={compact} />
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    )
  }

  const isArabic = language === "ar"
  const ChevronIcon = direction === "rtl" ? ChevronLeft : ChevronRight
  const groups = groupNotifications(items)

  return (
    <div dir={direction} className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p
              className={cn(
                "text-xs font-black text-muted-foreground/90",
                isArabic ? "text-[13px] tracking-normal" : "uppercase tracking-[0.2em]",
              )}
            >
              {getNotificationGroupLabel(group.key, language)}
            </p>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {group.items.length}
            </span>
          </div>

          <div className="space-y-3">
            {group.items.map((notification) => {
              const Icon = getNotificationIcon(notification)
              const copy = getNotificationCopy(notification, language)
              const styles = getTypeStyles(notification.type)
              const unread = !notification.readAt
              const relativeTime = formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
                locale: language === "ar" ? ar : enUS,
              })
              const deleteLabel =
                language === "ar"
                  ? "\u062D\u0630\u0641 \u0627\u0644\u0625\u0634\u0639\u0627\u0631"
                  : "Delete notification"
              const deleteButtonClassName =
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"

              return (
                <div
                  key={notification.id}
                  className={cn(
                    "group relative border-b border-border/40 transition-colors duration-200 last:border-0",
                    compact ? "py-3 px-2" : "py-4 px-2 sm:px-4",
                    unread ? "bg-primary/[0.02]" : "hover:bg-muted/30",
                  )}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <button
                      type="button"
                      onClick={() => void onOpenNotification(notification)}
                      className={cn(
                        "group col-span-2 flex min-w-0 items-start gap-3 text-start",
                        compact ? "sm:col-span-2" : "sm:col-span-1",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                          styles.container,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                dir={copy.direction}
                                className={cn(
                                  "line-clamp-2 text-[15px] font-bold leading-5 text-foreground sm:truncate sm:text-sm sm:leading-normal",
                                  language === "ar" && copy.direction === "ltr" && "text-left",
                                )}
                              >
                                {copy.title}
                              </p>
                              {unread ? (
                                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                              ) : null}
                            </div>
                            <p
                              dir={copy.direction}
                              className={cn(
                                "mt-1 break-words text-sm leading-6 text-muted-foreground sm:line-clamp-2 sm:leading-normal",
                                language === "ar" && copy.direction === "ltr" && "text-left",
                              )}
                            >
                              {copy.message}
                            </p>
                          </div>

                          <ChevronIcon
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                              direction === "rtl"
                                ? "group-hover:-translate-x-[1px]"
                                : "group-hover:translate-x-[1px]",
                            )}
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <span className="text-xs text-muted-foreground">{relativeTime}</span>
                          {notification.priority === "urgent" || notification.priority === "high" ? (
                            <span className="text-xs font-semibold text-rose-600">
                              {getNotificationPriorityLabel(notification.priority, language)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    {onDeleteNotification ? (
                      <button
                        type="button"
                        onClick={() => void onDeleteNotification(notification)}
                        aria-label={deleteLabel}
                        title={deleteLabel}
                        className={cn(
                          deleteButtonClassName,
                          compact
                            ? "col-start-2 row-start-2 self-end justify-self-end"
                            : "col-start-2 row-start-2 self-end justify-self-end sm:row-start-1 sm:self-start",
                        )}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                    <div
                      className={cn(
                        "col-start-1 row-start-2 min-w-0 ps-[3.25rem]",
                        onDeleteNotification ? "pe-2" : "",
                        compact ? "sm:col-span-1 sm:pe-2" : "sm:col-span-2 sm:pe-0",
                      )}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        {(() => {
                          const actionLabel = getNotificationActionLabel(notification, language)
                          if (!actionLabel) return null
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-full px-4 text-xs font-bold"
                              onClick={() => void onOpenNotification(notification)}
                            >
                              {actionLabel}
                            </Button>
                          )
                        })()}

                        {notification.deliverySummary?.web_push?.status === "failed" ? (
                          <span className="text-[11px] font-medium text-amber-700">
                            {language === "ar"
                              ? "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u062A\u0646\u0628\u064A\u0647"
                              : "Push failed"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
