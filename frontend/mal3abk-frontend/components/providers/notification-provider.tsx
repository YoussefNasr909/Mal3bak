"use client"

import type * as React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import {
  createPushSubscription as createPushSubscriptionApi,
  deleteNotification as deleteNotificationApi,
  deletePushSubscription as deletePushSubscriptionApi,
  getNotificationPreferences as getNotificationPreferencesApi,
  listNotifications as listNotificationsApi,
  markAllNotificationsRead as markAllNotificationsReadApi,
  markNotificationRead as markNotificationReadApi,
  NOTIFICATIONS_REFRESH_EVENT,
  updateNotificationPreferences as updateNotificationPreferencesApi,
} from "@/lib/api"
import {
  getBrowserPushSupport,
  getExistingPushSubscription,
  isBraveDesktopBrowser,
  getPushPermissionState,
  PUSH_NOTIFICATION_ID_PARAM,
  registerPushServiceWorker,
  serializePushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/browser-push"
import { sortNotifications } from "@/lib/notifications"
import type {
  Notification,
  NotificationPreference,
  NotificationPushState,
  NotificationSummary,
} from "@/lib/types"
import { useAuth } from "@/components/providers/auth-provider"

type NotificationContextValue = {
  items: Notification[]
  unreadCount: number
  urgentUnreadCount: number
  summary: NotificationSummary | null
  isLoading: boolean
  hasLoaded: boolean
  loadError: Error | null
  preferences: NotificationPreference | null
  pushState: NotificationPushState | null
  pushPermission: NotificationPermission | "unsupported"
  pushSupport: ReturnType<typeof getBrowserPushSupport>
  pushError: Error | null
  isPreferencesLoading: boolean
  isUpdatingPushPreferences: boolean
  refreshNotifications: (options?: { silent?: boolean }) => Promise<void>
  refreshPreferences: (options?: { silent?: boolean }) => Promise<void>
  markAsRead: (notificationId: string) => Promise<Notification | null>
  markAllAsRead: () => Promise<boolean>
  deleteNotificationItem: (notificationId: string) => Promise<boolean>
  setWebPushEnabled: (enabled: boolean) => Promise<boolean>
  setCriticalOnlyOnPush: (enabled: boolean) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

const RECENT_NOTIFICATIONS_LIMIT = 8
const NOTIFICATION_POLL_INTERVAL_MS = 60_000
const IDLE_NOTIFICATION_SETUP_TIMEOUT_MS = 1_800

function buildEmptySummary(): NotificationSummary {
  return {
    unreadCount: 0,
    urgentUnreadCount: 0,
    byCategory: {
      booking: 0,
      tournament: 0,
      account: 0,
      system: 0,
      admin: 0,
    },
  }
}

function isNotificationRead(notification: Notification) {
  return Boolean(notification.readAt)
}

function normalizeNotificationError(error: unknown) {
  if (error instanceof Error) return error
  return new Error("Failed to load notifications")
}

function emitNotificationsRefreshEvent() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT))
}

function markSummaryItemAsRead(summary: NotificationSummary | null, notification: Notification) {
  if (!summary || notification.readAt) return summary

  return {
    unreadCount: Math.max(0, summary.unreadCount - 1),
    urgentUnreadCount:
      notification.priority === "urgent"
        ? Math.max(0, summary.urgentUnreadCount - 1)
        : summary.urgentUnreadCount,
    byCategory: {
      ...summary.byCategory,
      [notification.category]: Math.max(0, summary.byCategory[notification.category] - 1),
    },
  }
}

function markSummaryByNotification(summary: NotificationSummary | null, notification: Notification) {
  if (!summary) return summary

  return {
    unreadCount: Math.max(0, summary.unreadCount - 1),
    urgentUnreadCount:
      notification.priority === "urgent"
        ? Math.max(0, summary.urgentUnreadCount - 1)
        : summary.urgentUnreadCount,
    byCategory: {
      ...summary.byCategory,
      [notification.category]: Math.max(0, summary.byCategory[notification.category] - 1),
    },
  }
}

function removeNotificationFromSummary(summary: NotificationSummary | null, notification: Notification) {
  if (!summary || notification.readAt) return summary

  return {
    unreadCount: Math.max(0, summary.unreadCount - 1),
    urgentUnreadCount:
      notification.priority === "urgent"
        ? Math.max(0, summary.urgentUnreadCount - 1)
        : summary.urgentUnreadCount,
    byCategory: {
      ...summary.byCategory,
      [notification.category]: Math.max(0, summary.byCategory[notification.category] - 1),
    },
  }
}

function normalizePushError(error: unknown) {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError" &&
    isBraveDesktopBrowser()
  ) {
    return new Error(
      "Brave can fail to create desktop push subscriptions even when notifications are allowed. Test push in Chrome or Edge, or on your deployed HTTPS site.",
    )
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return new Error(
      "Browser push registration did not finish. Refresh once and try again. If it still fails, remove the site's existing service worker/site data and retry.",
    )
  }
  if (error instanceof Error) return error
  return new Error("Push alert settings couldn't be updated")
}

function runWhenIdle(callback: () => void, timeout = IDLE_NOTIFICATION_SETUP_TIMEOUT_MS) {
  if (typeof window === "undefined") return () => undefined

  let didRun = false
  let timeoutId: number | undefined
  let idleId: number | undefined

  const run = () => {
    if (didRun) return
    didRun = true
    callback()
  }

  if (typeof window.requestIdleCallback === "function") {
    idleId = window.requestIdleCallback(run, { timeout })
  } else {
    timeoutId = window.setTimeout(run, timeout)
  }

  return () => {
    didRun = true
    if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId)
    }
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isAuthenticated } = useAuth()
  const pushSupport = useMemo(() => getBrowserPushSupport(), [])
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [summary, setSummary] = useState<NotificationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null)
  const [pushState, setPushState] = useState<NotificationPushState | null>(null)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(() => getPushPermissionState())
  const [pushError, setPushError] = useState<Error | null>(null)
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(false)
  const [isUpdatingPushPreferences, setIsUpdatingPushPreferences] = useState(false)
  const mountedRef = useRef(true)
  const hasLoadedRef = useRef(false)
  const lastUserIdRef = useRef<string | null>(null)
  const refreshPromiseRef = useRef<Promise<void> | null>(null)
  const preferencesPromiseRef = useRef<Promise<void> | null>(null)
  const skipNextRefreshEventRef = useRef(0)
  const itemsRef = useRef<Notification[]>([])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      refreshPromiseRef.current = null
      preferencesPromiseRef.current = null
    }
  }, [])

  useEffect(() => {
    hasLoadedRef.current = hasLoaded
  }, [hasLoaded])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const refreshNotifications = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user || !isAuthenticated) {
        if (mountedRef.current) {
          setItems([])
          setUnreadCount(0)
          setSummary(buildEmptySummary())
          setIsLoading(false)
          setHasLoaded(false)
          setLoadError(null)
        }
        return
      }

      if (refreshPromiseRef.current) {
        if (!options?.silent && mountedRef.current) {
          setIsLoading(true)
        }
        try {
          await refreshPromiseRef.current
        } finally {
          if (!options?.silent && mountedRef.current) {
            setIsLoading(false)
          }
        }
        return
      }

      if (!options?.silent && mountedRef.current) {
        setIsLoading(true)
        setLoadError(null)
      }

      const refreshPromise = (async () => {
        try {
          const result = await listNotificationsApi({
            page: 1,
            limit: RECENT_NOTIFICATIONS_LIMIT,
          })

          if (!mountedRef.current) return
          setItems(sortNotifications(result.items))
          setUnreadCount(result.unreadCount)
          setSummary(result.summary)
          setHasLoaded(true)
          setLoadError(null)
        } catch (error) {
          const normalizedError = normalizeNotificationError(error)
          console.error("Failed to refresh notifications:", error)
          if (!mountedRef.current) return
          setLoadError(normalizedError)
        } finally {
          refreshPromiseRef.current = null
          if (mountedRef.current) {
            setIsLoading(false)
          }
        }
      })()

      refreshPromiseRef.current = refreshPromise
      await refreshPromise
    },
    [isAuthenticated, user],
  )

  const refreshPreferences = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user || !isAuthenticated) {
        if (mountedRef.current) {
          setPreferences(null)
          setPushState(null)
          setPushError(null)
          setIsPreferencesLoading(false)
        }
        return
      }

      if (preferencesPromiseRef.current) {
        if (!options?.silent && mountedRef.current) {
          setIsPreferencesLoading(true)
        }
        try {
          await preferencesPromiseRef.current
        } finally {
          if (!options?.silent && mountedRef.current) {
            setIsPreferencesLoading(false)
          }
        }
        return
      }

      if (!options?.silent && mountedRef.current) {
        setIsPreferencesLoading(true)
      }

      const request = (async () => {
        try {
          const result = await getNotificationPreferencesApi()
          if (!mountedRef.current) return
          setPreferences(result.preferences)
          setPushState(result.push)
          setPushError(null)
        } catch (error) {
          const normalizedError = normalizePushError(error)
          console.error("Failed to refresh notification preferences:", error)
          if (!mountedRef.current) return
          setPushError(normalizedError)
        } finally {
          preferencesPromiseRef.current = null
          if (mountedRef.current) {
            setIsPreferencesLoading(false)
          }
        }
      })()

      preferencesPromiseRef.current = request
      await request
    },
    [isAuthenticated, user],
  )

  useEffect(() => {
    const userId = user?.id ?? null

    if (!userId || !isAuthenticated) {
      lastUserIdRef.current = null
      refreshPromiseRef.current = null
      preferencesPromiseRef.current = null
      if (mountedRef.current) {
        setItems([])
        setUnreadCount(0)
        setSummary(buildEmptySummary())
        setIsLoading(false)
        setHasLoaded(false)
        setLoadError(null)
        setPreferences(null)
        setPushState(null)
        setPushError(null)
        setIsPreferencesLoading(false)
        setPushPermission(getPushPermissionState())
      }
      return
    }

    const hasUserChanged = lastUserIdRef.current !== userId
    lastUserIdRef.current = userId

    if (hasUserChanged && mountedRef.current) {
      setItems([])
      setUnreadCount(0)
      setSummary(buildEmptySummary())
      setHasLoaded(false)
      setLoadError(null)
      setPushError(null)
      setPushPermission(getPushPermissionState())
    }

    void refreshNotifications()

    const shouldLoadNotificationSettingsNow = pathname === "/dashboard/notifications"
    const cancelDeferredNotificationSetup = shouldLoadNotificationSettingsNow
      ? (() => {
          void refreshPreferences({ silent: true })
          void registerPushServiceWorker().catch(() => null)
          return () => undefined
        })()
      : runWhenIdle(() => {
          void refreshPreferences({ silent: true })
          void registerPushServiceWorker().catch(() => null)
        })

    const retryTimer = window.setTimeout(() => {
      if (!mountedRef.current || hasLoadedRef.current || refreshPromiseRef.current) return
      void refreshNotifications({ silent: true })
    }, 350)

    return () => {
      cancelDeferredNotificationSetup()
      window.clearTimeout(retryTimer)
    }
  }, [isAuthenticated, pathname, refreshNotifications, refreshPreferences, user?.id])

  useEffect(() => {
    if (!user || !isAuthenticated) return

    const intervalId = window.setInterval(() => {
      void refreshNotifications({ silent: true })
    }, NOTIFICATION_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setPushPermission(getPushPermissionState())
        void refreshNotifications({ silent: true })
      }
    }

    const handleFocus = () => {
      setPushPermission(getPushPermissionState())
      void refreshNotifications({ silent: true })
    }

    const handleRefreshEvent = () => {
      if (skipNextRefreshEventRef.current > 0) {
        skipNextRefreshEventRef.current -= 1
        return
      }
      void refreshNotifications({ silent: true })
    }

    window.addEventListener("focus", handleFocus)
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefreshEvent as EventListener)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefreshEvent as EventListener)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isAuthenticated, refreshNotifications, user])

  useEffect(() => {
    if (typeof navigator === "undefined") return

    const appBadgeNavigator = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }

    if (typeof appBadgeNavigator.setAppBadge !== "function" && typeof appBadgeNavigator.clearAppBadge !== "function") {
      return
    }

    if (unreadCount > 0) {
      void appBadgeNavigator.setAppBadge?.(unreadCount).catch(() => undefined)
      return
    }

    void appBadgeNavigator.clearAppBadge?.().catch(() => undefined)
  }, [unreadCount])

  const markAsRead = useCallback(async (notificationId: string) => {
    const current = itemsRef.current.find((item) => item.id === notificationId)
    if (current && isNotificationRead(current)) return current

    const now = new Date().toISOString()
    if (current) {
      setItems((prev) =>
        sortNotifications(
          prev.map((item) =>
            item.id === notificationId ? { ...item, readAt: now } : item,
          ),
        ),
      )
      setSummary((prev) => markSummaryItemAsRead(prev, current))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    try {
      const result = await markNotificationReadApi(notificationId, { emitRefresh: false })
      if (!mountedRef.current) return result.notification

      setItems((prev) =>
        prev.some((item) => item.id === notificationId)
          ? sortNotifications(
              prev.map((item) =>
                item.id === notificationId ? result.notification : item,
              ),
            )
          : prev,
      )
      if (!current) {
        setSummary((prev) => markSummaryByNotification(prev, result.notification))
      }
      setUnreadCount(result.unreadCount)
      skipNextRefreshEventRef.current += 1
      emitNotificationsRefreshEvent()
      return result.notification
    } catch (error) {
      console.error("Failed to mark notification as read:", error)
      void refreshNotifications({ silent: true })
      return null
    }
  }, [refreshNotifications])

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return true

    const now = new Date().toISOString()
    setItems((prev) =>
      sortNotifications(
        prev.map((item) => (isNotificationRead(item) ? item : { ...item, readAt: now })),
      ),
    )
    setUnreadCount(0)
    setSummary((prev) => (prev ? { ...buildEmptySummary(), unreadCount: 0, urgentUnreadCount: 0 } : buildEmptySummary()))

    try {
      const result = await markAllNotificationsReadApi({ emitRefresh: false })
      if (!mountedRef.current) return true
      setUnreadCount(result.unreadCount)
      setSummary(buildEmptySummary())
      skipNextRefreshEventRef.current += 1
      emitNotificationsRefreshEvent()
      return true
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error)
      void refreshNotifications({ silent: true })
      return false
    }
  }, [refreshNotifications, unreadCount])

  const deleteNotificationItem = useCallback(async (notificationId: string) => {
    const current = itemsRef.current.find((item) => item.id === notificationId)

    if (current) {
      setItems((prev) => sortNotifications(prev.filter((item) => item.id !== notificationId)))
      setSummary((prev) => removeNotificationFromSummary(prev, current))
    }

    try {
      const result = await deleteNotificationApi(notificationId, { emitRefresh: false })
      if (!mountedRef.current) return true

      setUnreadCount(result.unreadCount)
      skipNextRefreshEventRef.current += 1
      emitNotificationsRefreshEvent()
      return true
    } catch (error) {
      console.error("Failed to delete notification:", error)
      void refreshNotifications({ silent: true })
      return false
    }
  }, [refreshNotifications])

  useEffect(() => {
    if (!user || !isAuthenticated) return

    const url = new URL(window.location.href)
    const notificationId = url.searchParams.get(PUSH_NOTIFICATION_ID_PARAM)
    if (!notificationId) return

    let cancelled = false

    void (async () => {
      await markAsRead(notificationId)
      if (cancelled) return
      url.searchParams.delete(PUSH_NOTIFICATION_ID_PARAM)
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    })()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, markAsRead, user])

  useEffect(() => {
    if (!preferences?.webPushEnabled || !pushState?.configured || !pushState.vapidPublicKey) {
      return
    }

    if (!pushSupport.supported || getPushPermissionState() !== "granted") {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const subscription = await subscribeToPush(pushState.vapidPublicKey!)
        if (cancelled) return
        await createPushSubscriptionApi(serializePushSubscription(subscription))
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync browser push subscription:", error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [preferences?.webPushEnabled, pushState?.configured, pushState?.vapidPublicKey, pushSupport.supported])

  useEffect(() => {
    if (!pushState?.configured || !pushSupport.supported || pushPermission === "unsupported") {
      setPushError(null)
    }
  }, [pushPermission, pushState?.configured, pushSupport.supported])

  const setWebPushEnabled = useCallback(async (enabled: boolean) => {
    setIsUpdatingPushPreferences(true)
    setPushError(null)

    try {
      if (enabled) {
        if (!pushSupport.supported) {
          throw new Error(
            pushSupport.reason === "ios_install_required"
              ? "On iPhone and iPad, install Mal3bk to the Home Screen before enabling push alerts."
              : pushSupport.reason === "secure_context_required"
                ? "Push alerts require a secure HTTPS connection."
                : "This browser doesn't support push alerts.",
          )
        }

        if (!pushState?.configured || !pushState.vapidPublicKey) {
          throw new Error("Push alerts are not configured on the server yet.")
        }

        let permission = getPushPermissionState()
        if (permission !== "granted") {
          permission = await Notification.requestPermission()
          setPushPermission(permission)
        }

        if (permission !== "granted") {
          throw new Error(
            permission === "denied"
              ? "Browser notifications are blocked. Allow notifications in your browser settings to enable push alerts."
              : "Push alert permission was not granted.",
          )
        }

        const subscription = await subscribeToPush(pushState.vapidPublicKey)
        await createPushSubscriptionApi(serializePushSubscription(subscription))
        const result = await updateNotificationPreferencesApi({ webPushEnabled: true })

        if (!mountedRef.current) return false
        setPreferences(result.preferences)
        setPushState(result.push)
        return true
      }

      const existingSubscription = await getExistingPushSubscription()
      if (existingSubscription) {
        await deletePushSubscriptionApi(existingSubscription.endpoint).catch(() => undefined)
      }
      await unsubscribeFromPush().catch(() => undefined)

      const result = await updateNotificationPreferencesApi({ webPushEnabled: false })
      if (!mountedRef.current) return false
      setPreferences(result.preferences)
      setPushState(result.push)
      return true
    } catch (error) {
      const normalized = normalizePushError(error)
      console.error("Failed to update web push preference:", error)
      if (mountedRef.current) {
        setPushError(normalized)
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsUpdatingPushPreferences(false)
      }
    }
  }, [pushState?.configured, pushState?.vapidPublicKey, pushSupport.reason, pushSupport.supported])

  const setCriticalOnlyOnPush = useCallback(async (enabled: boolean) => {
    setIsUpdatingPushPreferences(true)
    setPushError(null)

    try {
      const result = await updateNotificationPreferencesApi({
        criticalOnlyOnPush: enabled,
      })

      if (!mountedRef.current) return false
      setPreferences(result.preferences)
      setPushState(result.push)
      return true
    } catch (error) {
      const normalized = normalizePushError(error)
      console.error("Failed to update critical push preference:", error)
      if (mountedRef.current) {
        setPushError(normalized)
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsUpdatingPushPreferences(false)
      }
    }
  }, [])

  const value = useMemo<NotificationContextValue>(() => ({
    items,
    unreadCount,
    urgentUnreadCount: summary?.urgentUnreadCount ?? 0,
    summary,
    isLoading,
    hasLoaded,
    loadError,
    preferences,
    pushState,
    pushPermission,
    pushSupport,
    pushError,
    isPreferencesLoading,
    isUpdatingPushPreferences,
    refreshNotifications,
    refreshPreferences,
    markAsRead,
    markAllAsRead,
    deleteNotificationItem,
    setWebPushEnabled,
    setCriticalOnlyOnPush,
  }), [
    hasLoaded,
    isLoading,
    isPreferencesLoading,
    isUpdatingPushPreferences,
    items,
    loadError,
    markAllAsRead,
    markAsRead,
    deleteNotificationItem,
    preferences,
    pushError,
    pushPermission,
    pushState,
    pushSupport,
    refreshNotifications,
    refreshPreferences,
    setCriticalOnlyOnPush,
    setWebPushEnabled,
    summary,
    unreadCount,
  ])

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}
