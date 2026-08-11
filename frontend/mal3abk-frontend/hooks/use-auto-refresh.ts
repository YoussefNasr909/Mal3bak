"use client"

import { useEffect, useRef } from "react"

type UseAutoRefreshOptions = {
  enabled?: boolean
  intervalMs?: number
  refreshOnFocus?: boolean
  refreshOnVisible?: boolean
  refreshOnReconnect?: boolean
  cooldownMs?: number
}

export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs,
    refreshOnFocus = true,
    refreshOnVisible = true,
    refreshOnReconnect = true,
    cooldownMs = 1_000,
  }: UseAutoRefreshOptions = {},
) {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    let lastRefreshAt = 0

    const triggerRefresh = () => {
      const now = Date.now()
      if (now - lastRefreshAt < cooldownMs) return
      lastRefreshAt = now
      void refreshRef.current()
    }

    const handleFocus = () => {
      if (!refreshOnFocus) return
      triggerRefresh()
    }

    const handleVisibilityChange = () => {
      if (!refreshOnVisible || typeof document === "undefined") return
      if (document.visibilityState === "visible") {
        triggerRefresh()
      }
    }

    const handleOnline = () => {
      if (!refreshOnReconnect) return
      triggerRefresh()
    }

    let intervalId: number | null = null
    if (intervalMs && intervalMs > 0) {
      intervalId = window.setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return
        triggerRefresh()
      }, intervalMs)
    }

    if (refreshOnFocus) {
      window.addEventListener("focus", handleFocus)
    }

    if (refreshOnVisible && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }

    if (refreshOnReconnect) {
      window.addEventListener("online", handleOnline)
    }

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }

      if (refreshOnFocus) {
        window.removeEventListener("focus", handleFocus)
      }

      if (refreshOnVisible && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }

      if (refreshOnReconnect) {
        window.removeEventListener("online", handleOnline)
      }
    }
  }, [cooldownMs, enabled, intervalMs, refreshOnFocus, refreshOnReconnect, refreshOnVisible])
}
