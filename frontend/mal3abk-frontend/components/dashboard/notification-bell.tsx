"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Bell } from "lucide-react"
import { useRouter } from "next/navigation"

import { NetworkError } from "@/lib/api"
import type { Notification } from "@/lib/types"
import { cn } from "@/lib/utils"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/components/ui/use-mobile"
import { NotificationList } from "@/components/dashboard/notifications/notification-list"

function getUnreadCountLabel(unreadCount: number) {
  if (unreadCount > 99) return "99+"
  return String(unreadCount)
}

function getNotificationLoadErrorMessage(error: Error | null, language: string) {
  if (!error) return null

  if (error instanceof NetworkError) {
    return language === "ar"
      ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0628\u0633\u0628\u0628 \u0645\u0634\u0643\u0644\u0629 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644."
      : "Couldn't refresh notifications because of a connection problem."
  }

  return error.message || (
    language === "ar"
      ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u062d\u0627\u0644\u064a\u0627\u064b."
      : "Couldn't refresh notifications right now."
  )
}

type NotificationPanelContentProps = {
  language: string
  direction: "rtl" | "ltr"
  title: string
  summaryText: string
  items: Notification[]
  unreadCount: number
  isLoading: boolean
  hasLoaded: boolean
  loadErrorMessage: string | null
  onRetry: () => void
  onMarkAllAsRead: () => void
  onOpenNotification: (notification: Notification) => void | Promise<void>
  onDeleteNotification?: (notification: Notification) => void | Promise<void>
  onViewAll: () => void
  mobile?: boolean
}

function NotificationPanelContent({
  language,
  direction,
  title,
  summaryText,
  items,
  unreadCount,
  isLoading,
  hasLoaded,
  loadErrorMessage,
  onRetry,
  onMarkAllAsRead,
  onOpenNotification,
  onDeleteNotification,
  onViewAll,
  mobile = false,
}: NotificationPanelContentProps) {
  const isArabic = language === "ar"
  const emptyTitle = isArabic
    ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u0634\u0639\u0627\u0631\u0627\u062a \u062c\u062f\u064a\u062f\u0629"
    : "You're all caught up"
  const emptyDescription = isArabic
    ? "\u0633\u0646\u0638\u0647\u0631 \u0644\u0643 \u0627\u0644\u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0627\u0644\u0645\u0647\u0645\u0629 \u0647\u0646\u0627 \u0641\u0648\u0631 \u062d\u062f\u0648\u062b\u0647\u0627."
    : "Important booking and tournament updates will appear here."
  const refreshErrorTitle = isArabic
    ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a"
    : "Couldn't refresh notifications"
  const loadErrorTitle = isArabic
    ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a"
    : "Couldn't load notifications"
  const retryLabel = isArabic
    ? "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629"
    : "Try again"
  const markAllLabel = isArabic
    ? "\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0643\u0644 \u0643\u0645\u0642\u0631\u0648\u0621"
    : "Mark all read"
  const viewAllLabel = isArabic
    ? "\u0639\u0631\u0636 \u0643\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a"
    : "View all notifications"

  return (
    <div
      dir={direction}
      className={cn("flex flex-col", isArabic && "text-right")}
    >
      <div className="border-b border-border/40 px-4 py-3 bg-background">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-black text-foreground",
                isArabic ? "text-base leading-[1.75] tracking-normal" : "tracking-tight",
              )}
            >
              {title}
            </p>
            <p
              className={cn(
                "mt-1.5 text-xs text-muted-foreground leading-5",
                isArabic && "leading-6",
              )}
            >
              {summaryText}
            </p>
          </div>

          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:hover:no-underline"
            onClick={onMarkAllAsRead}
            disabled={unreadCount === 0}
          >
            {markAllLabel}
          </button>
        </div>
      </div>

      {loadErrorMessage && items.length > 0 ? (
        <div className="px-4 pt-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            <div className={cn("flex items-start gap-3", isArabic && "text-right")}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{refreshErrorTitle}</p>
                <p className="mt-1 text-amber-900/80">{loadErrorMessage}</p>
                <Button
                  variant="outline"
                  className="mt-3 h-9 rounded-2xl border-amber-300 bg-transparent"
                  onClick={onRetry}
                >
                  {retryLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loadErrorMessage && !items.length && !isLoading ? (
        <div className="px-4 py-4">
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-amber-200 bg-amber-50/60 px-6 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-foreground">{loadErrorTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadErrorMessage}</p>
            <Button
              variant="outline"
              className="mt-4 h-10 rounded-2xl border-amber-300 bg-transparent"
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className={`${mobile ? "max-h-[min(58dvh,28rem)]" : "max-h-[min(70vh,28rem)]"} overflow-y-auto px-4 py-4`}>
          <NotificationList
            items={items}
            language={language as "ar" | "en"}
            direction={direction}
            loading={isLoading && !hasLoaded}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            onOpenNotification={onOpenNotification}
            onDeleteNotification={onDeleteNotification}
            compact
          />
        </div>
      )}

      <div className="border-t border-border/60 p-3">
        <Button
          variant="outline"
          className={cn("h-10 w-full rounded-2xl", isArabic && "bg-background/80")}
          onClick={onViewAll}
        >
          {viewAllLabel}
        </Button>
      </div>
    </div>
  )
}

export function NotificationBell() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { language, direction } = useLanguage()
  const {
    items,
    unreadCount,
    urgentUnreadCount,
    isLoading,
    hasLoaded,
    loadError,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotificationItem,
  } = useNotifications()
  const [open, setOpen] = useState(false)
  const [notificationPendingDelete, setNotificationPendingDelete] = useState<Notification | null>(null)
  const [isDeletingNotification, setIsDeletingNotification] = useState(false)

  const isArabic = language === "ar"
  const isInitialLoad = !hasLoaded && isLoading
  const title = isArabic
    ? "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a"
    : "Notifications"
  const loadErrorMessage = useMemo(
    () => getNotificationLoadErrorMessage(loadError, language),
    [language, loadError],
  )
  const summaryText = loadErrorMessage
    ? (
        isArabic
          ? "\u0622\u062e\u0631 \u062a\u062d\u062f\u064a\u062b \u0644\u0645 \u064a\u0643\u062a\u0645\u0644. \u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."
          : "The latest refresh didn't finish. You can try again."
      )
    : isInitialLoad
      ? (
          isArabic
            ? "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a..."
            : "Loading notifications..."
        )
      : urgentUnreadCount > 0
        ? (
            isArabic
              ? `${urgentUnreadCount} \u0639\u0627\u062c\u0644\u0629 \u0645\u0646 \u0623\u0635\u0644 ${unreadCount} \u063a\u064a\u0631 \u0645\u0642\u0631\u0648\u0621\u0629`
              : `${urgentUnreadCount} urgent, ${unreadCount} unread`
          )
        : isArabic
          ? (
              unreadCount > 0
                ? `${unreadCount} \u063a\u064a\u0631 \u0645\u0642\u0631\u0648\u0621\u0629`
                : "\u0643\u0644 \u0634\u064a\u0621 \u0645\u0642\u0631\u0648\u0621"
            )
          : (
              unreadCount > 0
                ? `${unreadCount} unread`
                : "All caught up"
            )

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      void refreshNotifications({ silent: hasLoaded })
    }
  }

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.readAt) {
      await markAsRead(notification.id)
    }

    setOpen(false)
    if (notification.link) {
      router.push(notification.link)
      return
    }

    router.push("/dashboard/notifications")
  }

  const handleRetry = () => {
    void refreshNotifications({ silent: false })
  }

  const handleViewAll = () => {
    setOpen(false)
    router.push("/dashboard/notifications")
  }

  const handleRequestDeleteNotification = (notification: Notification) => {
    setNotificationPendingDelete(notification)
  }

  const handleConfirmDeleteNotification = async () => {
    if (!notificationPendingDelete || isDeletingNotification) return

    setIsDeletingNotification(true)
    try {
      await deleteNotificationItem(notificationPendingDelete.id)
      setNotificationPendingDelete(null)
    } finally {
      setIsDeletingNotification(false)
    }
  }

  const deleteTargetTitle = notificationPendingDelete
    ? (
        isArabic && notificationPendingDelete.titleAr
          ? notificationPendingDelete.titleAr
          : notificationPendingDelete.title
      )
    : ""

  const deleteDialogTitle = isArabic
    ? "\u062d\u0630\u0641 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u061f"
    : "Delete notification?"
  const deleteDialogDescription = notificationPendingDelete
    ? (
        isArabic
          ? `\u0633\u064a\u062a\u0645 \u062d\u0630\u0641 \u0625\u0634\u0639\u0627\u0631 "${deleteTargetTitle}" \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0646\u0647\u0627\u0626\u064a\u0627\u064b.`
          : `This will permanently remove "${deleteTargetTitle}" from your notifications list.`
      )
    : ""
  const deleteDialogCancelLabel = isArabic
    ? "\u0625\u0644\u063a\u0627\u0621"
    : "Cancel"
  const deleteDialogActionLabel = isDeletingNotification
    ? (
        isArabic
          ? "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0630\u0641..."
          : "Deleting..."
      )
    : (
        isArabic
          ? "\u062d\u0630\u0641 \u0627\u0644\u0625\u0634\u0639\u0627\u0631"
          : "Delete notification"
      )

  const bellButton = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-10 w-10 rounded-full text-foreground transition-all hover:bg-primary/10 hover:text-primary data-[state=open]:bg-primary/10"
      aria-label={title}
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 ? (
        <span className="absolute -end-0.5 -top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-none text-primary-foreground shadow-sm">
          {getUnreadCountLabel(unreadCount)}
        </span>
      ) : null}
    </Button>
  )

  return (
    <>
      <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          {bellButton}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align={direction === "rtl" ? "start" : "end"}
          sideOffset={10}
          className={cn(
            "w-[min(94vw,24rem)] overflow-hidden rounded-3xl border-border/70 bg-linear-to-b from-background via-background to-primary/[0.04] p-0 shadow-smooth-lg",
            isMobile && "max-h-[78vh]",
          )}
        >
          <NotificationPanelContent
            language={language}
            direction={direction}
            title={title}
            summaryText={summaryText}
            items={items}
            unreadCount={unreadCount}
            isLoading={isLoading}
            hasLoaded={hasLoaded}
            loadErrorMessage={loadErrorMessage}
            onRetry={handleRetry}
            onMarkAllAsRead={() => void markAllAsRead()}
            onOpenNotification={handleOpenNotification}
            onDeleteNotification={handleRequestDeleteNotification}
            onViewAll={handleViewAll}
            mobile={isMobile}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={Boolean(notificationPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeletingNotification) {
            setNotificationPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent dir={direction} className="rounded-[28px]">
          <AlertDialogHeader className={direction === "rtl" ? "text-right sm:text-right" : undefined}>
            <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={direction === "rtl" ? "sm:justify-start" : undefined}>
            <AlertDialogCancel disabled={isDeletingNotification} className="rounded-2xl">
              {deleteDialogCancelLabel}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="rounded-2xl"
              onClick={() => void handleConfirmDeleteNotification()}
              disabled={isDeletingNotification}
            >
              {deleteDialogActionLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
