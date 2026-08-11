"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BellRing, ChevronDown, Smartphone } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  ApiError,
  clearReadNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NetworkError,
  NOTIFICATIONS_REFRESH_EVENT,
} from "@/lib/api"
import { sortNotifications } from "@/lib/notifications"
import type { Notification, NotificationCategory, NotificationSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { NotificationList } from "@/components/dashboard/notifications/notification-list"
import { useLanguage } from "@/components/providers/language-provider"
import { useNotifications } from "@/components/providers/notification-provider"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type NotificationFilter =
  | "all"
  | "unread"
  | "important"
  | NotificationCategory

type Locale = "ar" | "en"

const PAGE_SIZE = 20
const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF]/
const MOJIBAKE_PATTERN = /[\u00C2\u00C3\u00D8\u00D9\uFFFD]/

const COPY = {
  en: {
    title: "Notifications",
    clearRead: "Clear read",
    markAllRead: "Mark all read",
    pushTitle: "Push alerts",
    pushDescription: "Enable browser push for the booking and match updates that matter most.",
    enablePush: "Enable browser push",
    enablePushDescription: "Send browser alerts for important booking and tournament changes based on your settings.",
    criticalOnly: "Critical alerts only",
    criticalOnlyDescription: "Keep browser push focused on urgent and high-priority updates.",
    pushStatus: "Push status",
    inboxTitle: "Updates inbox",
    noNotificationsTitle: "No notifications here yet",
    noNotificationsDescription: "New updates will appear here as they arrive.",
    tryAgain: "Try again",
    refresh: "Refresh",
    showingLatest: "Showing your latest saved notifications",
    couldntLoadTitle: "Couldn't load notifications",
    couldntRefreshTitle: "Couldn't refresh notifications",
    previous: "Previous",
    next: "Next",
    deleteDialogTitle: "Delete notification?",
    deleteDialogCancel: "Cancel",
    deleteDialogAction: "Delete notification",
    deleting: "Deleting...",
    page: "Page",
    of: "of",
    permission: "Permission",
    subscriptions: "Subscriptions",
    unread: "unread",
    urgent: "urgent",
    totalInView: "notifications in this view",
    allowed: "Allowed",
    blocked: "Blocked",
    notRequested: "Not requested",
    unsupported: "Unsupported",
  },
  ar: {
    sectionLabel: "\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A",
    title: "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A",
    clearRead: "\u062D\u0630\u0641 \u0627\u0644\u0645\u0642\u0631\u0648\u0621",
    markAllRead: "\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0643\u0644 \u0643\u0645\u0642\u0631\u0648\u0621",
    pushTitle: "\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D",
    pushDescription: "\u0641\u0639\u0651\u0644 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0644\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A \u0627\u0644\u0645\u0647\u0645\u0629 \u0641\u064A \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0645\u0646\u0627\u0633\u0628.",
    enablePush: "\u062A\u0641\u0639\u064A\u0644 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D",
    enablePushDescription: "\u0623\u0631\u0633\u0644 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0644\u0644\u062D\u062C\u0648\u0632\u0627\u062A \u0648\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u0628\u0637\u0648\u0644\u0627\u062A \u062D\u0633\u0628 \u0625\u0639\u062F\u0627\u062F\u0627\u062A\u0643.",
    criticalOnly: "\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u0647\u0645\u0629 \u0641\u0642\u0637",
    criticalOnlyDescription: "\u0627\u062C\u0639\u0644 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0645\u062D\u0635\u0648\u0631\u0629 \u0641\u064A \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A \u0627\u0644\u0639\u0627\u062C\u0644\u0629 \u0648\u0639\u0627\u0644\u064A\u0629 \u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629.",
    pushStatus: "\u062D\u0627\u0644\u0629 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D",
    inboxTitle: "\u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A",
    noNotificationsTitle: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0647\u0646\u0627 \u0628\u0639\u062F",
    noNotificationsDescription: "\u0639\u0646\u062F\u0645\u0627 \u062A\u0635\u0644 \u062A\u062D\u062F\u064A\u062B\u0627\u062A \u062C\u062F\u064A\u062F\u0629 \u0633\u062A\u062C\u062F\u0647\u0627 \u0647\u0646\u0627.",
    tryAgain: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629",
    refresh: "\u062A\u062D\u062F\u064A\u062B",
    showingLatest: "\u0646\u0639\u0631\u0636 \u0622\u062E\u0631 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u062D\u0641\u0648\u0638\u0629",
    couldntLoadTitle: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A",
    couldntRefreshTitle: "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A",
    previous: "\u0627\u0644\u0633\u0627\u0628\u0642",
    next: "\u0627\u0644\u062A\u0627\u0644\u064A",
    deleteDialogTitle: "\u062D\u0630\u0641 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u061F",
    deleteDialogCancel: "\u0625\u0644\u063A\u0627\u0621",
    deleteDialogAction: "\u062D\u0630\u0641 \u0627\u0644\u0625\u0634\u0639\u0627\u0631",
    deleting: "\u062C\u0627\u0631\u064A \u0627\u0644\u062D\u0630\u0641...",
    page: "\u0627\u0644\u0635\u0641\u062D\u0629",
    of: "\u0645\u0646",
    permission: "\u0627\u0644\u0625\u0630\u0646",
    subscriptions: "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A",
    unread: "\u063A\u064A\u0631 \u0645\u0642\u0631\u0648\u0621\u0629",
    urgent: "\u0639\u0627\u062C\u0644\u0629",
    totalInView: "\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636",
    allowed: "\u0645\u0633\u0645\u0648\u062D",
    blocked: "\u0645\u062D\u0638\u0648\u0631",
    notRequested: "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F",
    unsupported: "\u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645",
  },
} as const

const FILTER_LABELS = {
  all: { ar: "\u0627\u0644\u0643\u0644", en: "All" },
  unread: { ar: "\u063A\u064A\u0631 \u0627\u0644\u0645\u0642\u0631\u0648\u0621\u0629", en: "Unread" },
  important: { ar: "\u0627\u0644\u0645\u0647\u0645\u0629", en: "Important" },
  booking: { ar: "\u0627\u0644\u062D\u062C\u0648\u0632\u0627\u062A", en: "Booking" },
  tournament: { ar: "\u0627\u0644\u0628\u0637\u0648\u0644\u0627\u062A", en: "Tournament" },
  account: { ar: "\u0627\u0644\u062D\u0633\u0627\u0628", en: "Account" },
  system: { ar: "\u0627\u0644\u0646\u0638\u0627\u0645", en: "System" },
  admin: { ar: "\u0627\u0644\u0625\u062F\u0627\u0631\u0629", en: "Admin" },
} as const

function getNotificationsLoadErrorMessage(error: unknown, language: Locale) {
  if (error instanceof NetworkError) {
    return language === "ar"
      ? "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0628\u0633\u0628\u0628 \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649."
      : "Couldn't load notifications because of a connection problem. Please try again."
  }

  if (error instanceof ApiError && error.message) {
    return error.message
  }

  return language === "ar"
    ? "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u062D\u0627\u0644\u064A\u0627\u064B. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649."
    : "Couldn't load notifications right now. Please try again."
}

function getFilterQuery(filter: NotificationFilter) {
  if (filter === "unread") {
    return { unreadOnly: true }
  }

  if (filter === "important") {
    return { priority: "important" as const }
  }

  if (filter === "all") {
    return {}
  }

  return { category: filter }
}

function getPushSupportMessage(
  language: Locale,
  options: {
    configured: boolean
    permission: NotificationPermission | "unsupported"
    reason: "unsupported" | "secure_context_required" | "ios_install_required" | null
    subscriptionCount: number
  },
) {
  if (!options.configured) {
    return language === "ar"
      ? "\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u063A\u064A\u0631 \u0645\u0641\u0639\u0644\u0629 \u0639\u0644\u0649 \u0627\u0644\u062E\u0627\u062F\u0645 \u0628\u0639\u062F."
      : "Browser push isn't configured on the server yet."
  }

  if (options.reason === "ios_install_required") {
    return language === "ar"
      ? "\u0639\u0644\u0649 iPhone \u0648 iPad\u060C \u062B\u0628\u0651\u062A Mal3bk \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0623\u0648\u0644\u0627\u064B \u062D\u062A\u0649 \u062A\u0639\u0645\u0644 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D."
      : "On iPhone and iPad, install Mal3bk to the Home Screen before enabling push alerts."
  }

  if (options.reason === "secure_context_required") {
    return language === "ar"
      ? "\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u062A\u062D\u062A\u0627\u062C \u0627\u062A\u0635\u0627\u0644 HTTPS \u0622\u0645\u0646."
      : "Browser push requires a secure HTTPS connection."
  }

  if (options.reason === "unsupported" || options.permission === "unsupported") {
    return language === "ar"
      ? "\u0647\u0630\u0627 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0644\u0627 \u064A\u062F\u0639\u0645 \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D."
      : "This browser doesn't support push alerts."
  }

  if (options.permission === "denied") {
    return language === "ar"
      ? "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u062D\u0638\u0648\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D. \u0641\u0639\u0651\u0644\u0647\u0627 \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D."
      : "Notifications are blocked in your browser. Enable them in browser settings."
  }

  if (options.permission === "granted") {
    return language === "ar"
      ? `\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627. \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0646\u0634\u0637\u0629: ${options.subscriptionCount}.`
      : `Notifications are allowed. Active subscriptions: ${options.subscriptionCount}.`
  }

  return language === "ar"
    ? "\u0639\u0646\u062F \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0633\u0646\u0637\u0644\u0628 \u0625\u0630\u0646 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u0646 \u0627\u0644\u0645\u062A\u0635\u0641\u062D."
    : "When you enable the switch, we'll ask the browser for notification permission."
}

function getFilterLabel(filter: NotificationFilter, language: Locale) {
  return FILTER_LABELS[filter][language]
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

function getNotificationDeleteTitle(notification: Notification | null, language: Locale) {
  if (!notification) return ""

  if (language === "ar") {
    const normalizedArabicTitle = repairArabicMojibake(notification.titleAr)
    if (ARABIC_SCRIPT_PATTERN.test(normalizedArabicTitle)) {
      return normalizedArabicTitle
    }
  }

  return notification.title
}

function getHeaderDescription(language: Locale, unreadCount: number) {
  if (language === "ar") {
    return unreadCount > 0
      ? `\u0644\u062F\u064A\u0643 ${unreadCount} \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u063A\u064A\u0631 \u0645\u0642\u0631\u0648\u0621\u0629.`
      : "\u062A\u0627\u0628\u0639 \u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0627\u0644\u062D\u062C\u0648\u0632\u0627\u062A \u0648\u0627\u0644\u0628\u0637\u0648\u0644\u0627\u062A \u0648\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0645\u0646 \u0645\u0643\u0627\u0646 \u0648\u0627\u062D\u062F."
  }

  return unreadCount > 0
    ? `You have ${unreadCount} unread notifications.`
    : "Follow booking, tournament, and account updates from one place."
}

function getPermissionLabel(language: Locale, permission: NotificationPermission | "unsupported") {
  const copy = COPY[language]

  if (permission === "granted") return copy.allowed
  if (permission === "denied") return copy.blocked
  if (permission === "default") return copy.notRequested
  return copy.unsupported
}

type SettingRowProps = {
  direction: "rtl" | "ltr"
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  ariaLabel: string
  onCheckedChange: (checked: boolean) => void
}

function SettingRow({
  direction,
  title,
  description,
  checked,
  disabled = false,
  ariaLabel,
  onCheckedChange,
}: SettingRowProps) {
  const isRTL = direction === "rtl"

  return (
    <div
      dir={direction}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-4",
        disabled && "opacity-70",
      )}
    >
      <div className={cn("min-w-0 flex-1 space-y-1", isRTL && "text-right")}>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div dir="ltr" className="flex shrink-0 items-center justify-center justify-self-end">
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={ariaLabel}
          className="scale-110"
        />
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const router = useRouter()
  const { language, direction } = useLanguage()
  const locale = language as Locale
  const copy = COPY[locale]
  const isRTL = direction === "rtl"
  const {
    unreadCount,
    urgentUnreadCount,
    summary,
    preferences,
    pushState,
    pushPermission,
    pushSupport,
    pushError,
    isPreferencesLoading,
    isUpdatingPushPreferences,
    refreshNotifications,
    setWebPushEnabled,
    setCriticalOnlyOnPush,
  } = useNotifications()
  const [filter, setFilter] = useState<NotificationFilter>("all")
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showStaleWarning, setShowStaleWarning] = useState(false)
  const [isPushAlertsOpen, setIsPushAlertsOpen] = useState(false)
  const [notificationPendingDelete, setNotificationPendingDelete] = useState<Notification | null>(null)
  const [isDeletingNotification, setIsDeletingNotification] = useState(false)
  const requestIdRef = useRef(0)
  const hasLoadedOnceRef = useRef(false)

  const loadNotifications = useCallback(
    async (options?: { silent?: boolean }) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId

      if (!options?.silent) {
        setIsLoading(true)
        setLoadError(null)
        setShowStaleWarning(false)
      }

      try {
        const query = getFilterQuery(filter)
        const result = await listNotifications({
          page,
          limit: PAGE_SIZE,
          unreadOnly: query.unreadOnly,
          category: query.category,
          priority: query.priority,
        })

        if (requestId !== requestIdRef.current) return

        setItems(sortNotifications(result.items))
        setTotal(result.total)
        setPages(result.pages)
        setLoadError(null)
        setShowStaleWarning(false)
        hasLoadedOnceRef.current = true

        if (page > result.pages && result.pages > 0) {
          setPage(result.pages)
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) return

        setLoadError(getNotificationsLoadErrorMessage(error, locale))
        setShowStaleWarning(Boolean(options?.silent && hasLoadedOnceRef.current))
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [filter, locale, page],
  )

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    const handleRefresh = () => {
      void loadNotifications({ silent: true })
    }

    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh as EventListener)
    window.addEventListener("focus", handleRefresh)

    return () => {
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh as EventListener)
      window.removeEventListener("focus", handleRefresh)
    }
  }, [loadNotifications])

  const markNotificationReadInPageState = useCallback((updatedNotification: Notification) => {
    if (filter === "unread") {
      const nextTotal = Math.max(0, total - 1)
      const nextPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))

      setItems((prev) => sortNotifications(prev.filter((item) => item.id !== updatedNotification.id)))
      setTotal(nextTotal)
      setPages(nextPages)

      if (page > nextPages) {
        setPage(nextPages)
      }
      return
    }

    setItems((prev) =>
      sortNotifications(
        prev.map((item) => (item.id === updatedNotification.id ? updatedNotification : item)),
      ),
    )
  }, [filter, page, total])

  const markAllNotificationsReadInPageState = useCallback(() => {
    const now = new Date().toISOString()

    if (filter === "unread") {
      setItems([])
      setTotal(0)
      setPages(1)
      if (page !== 1) {
        setPage(1)
      }
      return
    }

    setItems((prev) =>
      sortNotifications(
        prev.map((item) => (item.readAt ? item : { ...item, readAt: now })),
      ),
    )
  }, [filter, page])

  const removeNotificationFromPageState = useCallback((notificationId: string) => {
    const exists = items.some((item) => item.id === notificationId)
    if (!exists) return

    const nextTotal = Math.max(0, total - 1)
    const nextPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))

    setItems((prev) => sortNotifications(prev.filter((item) => item.id !== notificationId)))
    setTotal(nextTotal)
    setPages(nextPages)

    if (page > nextPages) {
      setPage(nextPages)
    }
  }, [items, page, total])

  const clearReadNotificationsInPageState = useCallback(() => {
    const removedCount = items.filter((item) => Boolean(item.readAt)).length
    if (removedCount <= 0) return

    const nextTotal = Math.max(0, total - removedCount)
    const nextPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))

    setItems((prev) => sortNotifications(prev.filter((item) => !item.readAt)))
    setTotal(nextTotal)
    setPages(nextPages)

    if (page > nextPages) {
      setPage(nextPages)
    }
  }, [items, page, total])

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.readAt) {
      try {
        const result = await markNotificationRead(notification.id, { emitRefresh: false })
        markNotificationReadInPageState(result.notification)
        void refreshNotifications({ silent: true })
      } catch (error) {
        setLoadError(getNotificationsLoadErrorMessage(error, locale))
        setShowStaleWarning(false)
        return
      }
    }

    if (notification.link) {
      router.push(notification.link)
      return
    }

    router.push("/dashboard/notifications")
  }

  const headerDescription = useMemo(
    () => getHeaderDescription(locale, unreadCount),
    [locale, unreadCount],
  )

  const showBlockingError = Boolean(loadError) && !isLoading && !showStaleWarning
  const showInlineError = Boolean(loadError) && !isLoading && showStaleWarning
  const hasReadNotifications = items.some((item) => Boolean(item.readAt))

  const filterOptions: NotificationFilter[] = [
    "all",
    "unread",
    "important",
    "booking",
    "tournament",
    "account",
    "system",
    "admin",
  ]

  const currentSummary: NotificationSummary = summary ?? {
    unreadCount,
    urgentUnreadCount,
    byCategory: {
      booking: 0,
      tournament: 0,
      account: 0,
      system: 0,
      admin: 0,
    },
  }

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return

    try {
      await markAllNotificationsRead({ emitRefresh: false })
      markAllNotificationsReadInPageState()
      await refreshNotifications({ silent: true })
    } catch (error) {
      setLoadError(getNotificationsLoadErrorMessage(error, locale))
      setShowStaleWarning(false)
    }
  }

  const handleRequestDeleteNotification = (notification: Notification) => {
    setNotificationPendingDelete(notification)
  }

  const handleConfirmDeleteNotification = async () => {
    if (!notificationPendingDelete || isDeletingNotification) return

    setIsDeletingNotification(true)

    try {
      const result = await deleteNotification(notificationPendingDelete.id, { emitRefresh: false })
      removeNotificationFromPageState(result.deletedId)
      setNotificationPendingDelete(null)
      await refreshNotifications({ silent: true })
    } catch (error) {
      setLoadError(getNotificationsLoadErrorMessage(error, locale))
      setShowStaleWarning(false)
      setNotificationPendingDelete(null)
    } finally {
      setIsDeletingNotification(false)
    }
  }

  const handleClearReadNotifications = async () => {
    if (!hasReadNotifications) return

    try {
      await clearReadNotifications({ emitRefresh: false })
      clearReadNotificationsInPageState()
      await refreshNotifications({ silent: true })
    } catch (error) {
      setLoadError(getNotificationsLoadErrorMessage(error, locale))
      setShowStaleWarning(false)
    }
  }

  const pushStatusMessage = getPushSupportMessage(locale, {
    configured: Boolean(pushState?.configured),
    permission: pushPermission,
    reason: pushSupport.reason,
    subscriptionCount: pushState?.subscriptionCount ?? 0,
  })

  const shouldShowPushError =
    Boolean(pushError) &&
    Boolean(pushState?.configured) &&
    pushSupport.supported &&
    pushPermission !== "unsupported"

  const mainPushSwitchDisabled =
    isPreferencesLoading ||
    isUpdatingPushPreferences ||
    !pushState?.configured ||
    !pushSupport.supported

  const deleteTargetTitle = getNotificationDeleteTitle(notificationPendingDelete, locale)
  const deleteDialogDescription = notificationPendingDelete
    ? (
        locale === "ar"
          ? `\u0633\u064A\u062A\u0645 \u062D\u0630\u0641 \u0625\u0634\u0639\u0627\u0631 "${deleteTargetTitle}" \u0645\u0646 \u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0646\u0647\u0627\u0626\u064A\u0627\u064B.`
          : `This will permanently remove "${deleteTargetTitle}" from your updates inbox.`
      )
    : ""

  return (
    <div dir={direction} className={cn("space-y-6", isRTL && "text-right")}>
      <Card className="overflow-hidden rounded-[28px] border-border/70 bg-card/80 shadow-sm">
        <div className="px-5 py-5">
          <div
            className={cn(
              "flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 max-w-3xl flex-col gap-4",
                isRTL ? "lg:items-end lg:text-right" : "lg:items-start",
              )}
            >
              <div className="space-y-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                  {copy.title}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{headerDescription}</p>
              </div>
            </div>

            <div
              className={cn(
                "flex flex-col gap-3",
                isRTL ? "lg:items-start" : "lg:items-end",
              )}
            >
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => void handleClearReadNotifications()}
                  disabled={!hasReadNotifications}
                >
                  {copy.clearRead}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => void handleMarkAllAsRead()}
                  disabled={unreadCount === 0}
                >
                  {copy.markAllRead}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full">
                  {currentSummary.unreadCount} {copy.unread}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {total} {copy.totalInView}
                </Badge>
              </div>
            </div>
          </div>
        </div>


      </Card>

      <Card className="rounded-[28px] border-border/70 bg-card/80 shadow-sm">
        <div className="space-y-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className={cn("space-y-2", isRTL && "text-right")}>
              <h2 className="text-lg font-bold text-foreground">{copy.inboxTitle}</h2>
              <p className="text-sm text-muted-foreground">
                {total} {copy.totalInView}
              </p>
              <div className={cn("flex flex-wrap gap-2 text-sm text-muted-foreground", isRTL && "justify-end")}>
                <span>{currentSummary.unreadCount} {copy.unread}</span>
              </div>
            </div>
          </div>

          <Tabs
            value={filter}
            dir={direction}
            onValueChange={(value) => {
              setFilter(value as NotificationFilter)
              setPage(1)
            }}
          >
            <div className="overflow-x-auto pb-2 scrollbar-hide">
              <TabsList className="h-auto w-max min-w-full justify-start gap-2 bg-transparent p-0">
                {filterOptions.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={option}
                    className="rounded-full border border-transparent px-4 py-2 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-all hover:bg-muted/40 data-[state=active]:border-border/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                  >
                    {getFilterLabel(option, locale)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>

          {showBlockingError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-950">
              <p className="font-bold">{copy.couldntLoadTitle}</p>
              <p className="mt-1 text-amber-900/80">{loadError}</p>
              <Button
                variant="outline"
                className="mt-4 rounded-2xl border-amber-300 bg-transparent"
                onClick={() => void loadNotifications()}
              >
                {copy.tryAgain}
              </Button>
            </div>
          ) : (
            <>
              {showInlineError ? (
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm text-amber-950 md:flex-row md:items-center md:justify-between",
                    isRTL && "md:flex-row-reverse",
                  )}
                >
                  <div>
                    <p className="font-bold">{copy.showingLatest}</p>
                    <p className="mt-1 text-amber-900/80">{loadError}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-2xl border-amber-300 bg-transparent"
                    onClick={() => void loadNotifications({ silent: true })}
                  >
                    {copy.refresh}
                  </Button>
                </div>
              ) : null}

              <NotificationList
                items={items}
                language={locale}
                direction={direction}
                loading={isLoading}
                emptyTitle={copy.noNotificationsTitle}
                emptyDescription={copy.noNotificationsDescription}
                onOpenNotification={handleOpenNotification}
                onDeleteNotification={handleRequestDeleteNotification}
              />
            </>
          )}

          <div
            className={cn(
              "flex flex-col gap-3 border-t border-border/60 pt-5 md:flex-row md:items-center md:justify-between",
              isRTL && "md:flex-row-reverse",
            )}
          >
            <p className="text-sm text-muted-foreground">
              {copy.page} {page} {copy.of} {pages}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                {copy.previous}
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
                disabled={page >= pages}
              >
                {copy.next}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border-border/70 bg-card/80 shadow-sm">
        <Collapsible open={isPushAlertsOpen} onOpenChange={setIsPushAlertsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "group flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/20",
                isRTL && "text-right",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-start gap-3",
                  isRTL && "text-right",
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className={cn("min-w-0 space-y-1", isRTL && "text-right")}>
                  <h2 className="text-lg font-bold text-foreground">{copy.pushTitle}</h2>
                  <p className="text-sm leading-7 text-muted-foreground">{copy.pushDescription}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:text-foreground">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      isPushAlertsOpen && "rotate-180",
                    )}
                  />
                </div>
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="space-y-3 border-t border-border/60 px-5 pb-5 pt-4">
              <SettingRow
                direction={direction}
                title={copy.enablePush}
                description={copy.enablePushDescription}
                checked={Boolean(preferences?.webPushEnabled)}
                disabled={mainPushSwitchDisabled}
                ariaLabel={copy.enablePush}
                onCheckedChange={(checked) => void setWebPushEnabled(checked)}
              />

              <SettingRow
                direction={direction}
                title={copy.criticalOnly}
                description={copy.criticalOnlyDescription}
                checked={Boolean(preferences?.criticalOnlyOnPush)}
                disabled={isPreferencesLoading || isUpdatingPushPreferences || !preferences?.webPushEnabled}
                ariaLabel={copy.criticalOnly}
                onCheckedChange={(checked) => void setCriticalOnlyOnPush(checked)}
              />

              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-4">
                <div className={cn("space-y-3", isRTL && "text-right")}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <BellRing className="h-4 w-4" />
                    </div>
                    <div className={cn("min-w-0 flex-1 space-y-1", isRTL && "text-right")}>
                      <p className="text-sm font-semibold text-foreground">{copy.pushStatus}</p>
                      <p className="text-sm leading-7 text-muted-foreground">{pushStatusMessage}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full">
                      {copy.permission}: {getPermissionLabel(locale, pushPermission)}
                    </Badge>
                    <Badge variant="outline" className="rounded-full">
                      {copy.subscriptions}: {pushState?.subscriptionCount ?? 0}
                    </Badge>
                  </div>

                  {shouldShowPushError ? (
                    <p className="text-sm font-medium text-rose-600">{pushError?.message}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <AlertDialog
        open={Boolean(notificationPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingNotification) {
            setNotificationPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent dir={direction} className="rounded-[28px]">
          <AlertDialogHeader className={isRTL ? "text-right sm:text-right" : undefined}>
            <AlertDialogTitle>{copy.deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={cn(isRTL && "sm:flex-row-reverse sm:justify-start")}>
            <AlertDialogCancel disabled={isDeletingNotification} className="rounded-2xl">
              {copy.deleteDialogCancel}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="rounded-2xl"
              onClick={() => void handleConfirmDeleteNotification()}
              disabled={isDeletingNotification}
            >
              {isDeletingNotification ? copy.deleting : copy.deleteDialogAction}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
