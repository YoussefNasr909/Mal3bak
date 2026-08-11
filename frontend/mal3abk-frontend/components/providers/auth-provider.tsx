"use client"

import type * as React from "react"
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { useRouter, usePathname } from "next/navigation"
import { ApiError, NetworkError, authLogin, authLogout, authMe, authRegister, authRefresh, authSession, type ApiUser } from "@/lib/api"
import { navigateToLogoutRoute } from "@/lib/logout-navigation"
import { toast } from "sonner"

export type UserRole = "admin" | "manager" | "player"

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
  avatar?: string
  createdAt: Date
  apiToken?: string
  preferences?: {
    theme?: string
    notifications?: boolean
    language?: string
  }
  // Manager-specific extensions (kept for existing dashboards)
  managerAccount?: {
    businessName: string
    license: string
    licenseVerified: boolean
    analyticsData?: {
      totalBookings: number
      occupancyRate: number
      averageRating: number
    }
  }
  subscription?: {
    plan: "starter" | "pro" | "enterprise"
    status: "active" | "cancelled" | "expired"
    courtsLimit: number
  }
  isSubscriptionActive?: boolean
  playerStats?: {
    totalBookings: number
    favoriteCourtIds: string[]
    membershipLevel: "bronze" | "silver" | "gold" | "platinum"
  }
  stats?: {
    totalBookings: number
    completedBookings: number
    cancelledBookings: number
    upcomingBookings: number
    favoriteCourts: number
    totalCourts: number
  }
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isLoggingOut: boolean
  login: (email: string, password: string, remember?: boolean) => Promise<User>
  register: (data: RegisterData) => Promise<User>
  logout: () => Promise<void>
  updateUser: (data: Partial<User>) => void
  refreshUser: () => Promise<User | null>
  sessionExpired: boolean
  setSessionExpired: (expired: boolean) => void
  isSessionVerified: boolean
  isServerOffline: boolean
  checkConnection: () => Promise<void>
}

interface RegisterData {
  name: string
  email: string
  phone: string
  password: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const ConnectivityError = dynamic(
  () => import("@/components/ui/connectivity-error").then((mod) => mod.ConnectivityError),
  { ssr: false },
)

const PERSIST_KEY = "mal3bk_user_persist"
const SESSION_KEY = "mal3bk_user"
const AUTH_META_COOKIE = "mal3bk_auth_meta"
const AUTH_EVENT_KEY = "mal3bk_auth_event"
const LOGOUT_ROUTE = "/auth/logout"
const SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000
const VISIBILITY_REFRESH_THRESHOLD_MS = 8 * 60 * 1000
const REFRESH_USER_DEBOUNCE_MS = 15000
type LogoutReason = "user_initiated" | "session_expired"
type AuthBroadcastEvent =
  | { type: "login"; at: number }
  | { type: "logout"; at: number; reason: LogoutReason }

// This cookie is NOT the auth token.
// It is a lightweight, frontend-readable cookie used only as a hint to avoid
// unnecessary /auth/me requests on public pages.
function setAuthCookieMeta(_user: { id: string; role: UserRole }, days?: number) {
  if (typeof document === "undefined") return

  const maxAge = typeof days === "number" ? `; Max-Age=${Math.max(0, Math.floor(days * 24 * 60 * 60))}` : ""
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : ""

  document.cookie = `${AUTH_META_COOKIE}=1; Path=/; SameSite=Lax${maxAge}${secure}`
}

function clearAuthCookieMeta() {
  if (typeof document === "undefined") return

  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${AUTH_META_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

function hasAuthCookieMeta() {
  if (typeof document === "undefined") return false
  return document.cookie.split(";").some((cookie) => cookie.trim().startsWith(`${AUTH_META_COOKIE}=`))
}

function toFrontendUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    name: apiUser.name,
    email: apiUser.email,
    phone: apiUser.phone ?? undefined,
    avatar: apiUser.avatar ?? undefined,
    role: apiUser.role,
    createdAt: new Date(apiUser.createdAt),
    stats: apiUser.stats
      ? {
          totalBookings: apiUser.stats.totalBookings ?? 0,
          completedBookings: apiUser.stats.completedBookings ?? 0,
          cancelledBookings: apiUser.stats.cancelledBookings ?? 0,
          upcomingBookings: apiUser.stats.upcomingBookings ?? 0,
          favoriteCourts: apiUser.stats.favoriteCourts ?? 0,
          totalCourts: apiUser.stats.totalCourts ?? 0,
        }
      : undefined,
  }
}

function parseStoredUser(raw: string | null): User | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return { ...parsed, createdAt: new Date(parsed.createdAt) } as User
  } catch {
    return null
  }
}

function safeSessionStorageGet(key: string) {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(key, value)
  } catch {}
}

function safeSessionStorageRemove(key: string) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(key)
  } catch {}
}

function safeLocalStorageGet(key: string) {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

function readStoredUser(): User | null {
  if (typeof window === "undefined") return null
  const persisted = safeLocalStorageGet(PERSIST_KEY)
  const sessioned = safeSessionStorageGet(SESSION_KEY)
  const raw = persisted || sessioned
  if (!raw) return null

  const parsed = parseStoredUser(raw)
  if (!parsed) {
    safeLocalStorageRemove(PERSIST_KEY)
    safeSessionStorageRemove(SESSION_KEY)
  }

  return parsed
}

function broadcastAuthEvent(event: AuthBroadcastEvent) {
  if (typeof window === "undefined") return

  try {
    safeLocalStorageSet(AUTH_EVENT_KEY, JSON.stringify(event))
  } catch {}
}

function writeStoredUser(u: User, remember?: boolean) {
  const serialized = JSON.stringify(u)
  safeSessionStorageSet(SESSION_KEY, serialized)

  if (remember) {
    try {
      safeLocalStorageSet(PERSIST_KEY, serialized)
    } catch {}
    // Remembered => long-lived meta cookie
    setAuthCookieMeta({ id: u.id, role: u.role }, 30)
  } else {
    try {
      safeLocalStorageRemove(PERSIST_KEY)
    } catch {}
    // Session only => no expiry
    setAuthCookieMeta({ id: u.id, role: u.role })
  }

  safeSessionStorageRemove("mal3bk_session_end")
}

function clearStoredUser() {
  safeSessionStorageRemove(SESSION_KEY)
  try {
    safeLocalStorageRemove(PERSIST_KEY)
  } catch {}
  safeSessionStorageRemove("mal3bk_session_end")
  clearAuthCookieMeta()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isSessionVerified, setIsSessionVerified] = useState(false)
  const [isServerOffline, setIsServerOffline] = useState(false)
  const [showConnectivityOverlay, setShowConnectivityOverlay] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const initialPathnameRef = useRef(pathname)
  const logoutInProgressRef = useRef(false)
  const refreshUserPromiseRef = useRef<Promise<User | null> | null>(null)
  const refreshCookiePromiseRef = useRef<Promise<boolean> | null>(null)
  const lastFullUserRefreshAtRef = useRef(0)
  const lastSessionHeartbeatRef = useRef(0)

  const markSessionHeartbeat = useCallback(() => {
    lastSessionHeartbeatRef.current = Date.now()
  }, [])

  const isDashboardPath = useCallback((value?: string | null) => {
    return typeof value === "string" && value.startsWith("/dashboard")
  }, [])

  const isAuthPath = useCallback((value?: string | null) => {
    return typeof value === "string" && value.startsWith("/auth")
  }, [])

  const redirectToLogin = useCallback(() => {
    router.replace("/auth/login")
  }, [router])

  const completeLogoutNavigation = useCallback(async () => {
    if (typeof window !== "undefined") {
      await navigateToLogoutRoute(LOGOUT_ROUTE)
    }

    router.replace("/auth/login")
  }, [router])

  const clearExpiredSession = useCallback((broadcast = true) => {
    clearStoredUser()
    setUser(null)
    setIsLoggingOut(false)
    setIsSessionVerified(false)
    setSessionExpired(true)
    if (broadcast) {
      broadcastAuthEvent({ type: "logout", reason: "session_expired", at: Date.now() })
    }
  }, [])

  const refreshSessionCookie = useCallback(async () => {
    if (logoutInProgressRef.current) return false
    if (refreshCookiePromiseRef.current) {
      return refreshCookiePromiseRef.current
    }

    const request = (async () => {
      try {
        await authRefresh()
        if (logoutInProgressRef.current) return false
        setIsLoggingOut(false)
        setSessionExpired(false)
        setIsSessionVerified(true)
        setIsServerOffline(false)
        markSessionHeartbeat()
        return true
      } catch (err: any) {
        if (err instanceof NetworkError || err?.name === "NetworkError") {
          setIsServerOffline(true)
          return false
        }

        const isUnauthorized = err instanceof ApiError && (err.status === 401 || err.status === 403)
        if (isUnauthorized) {
          clearExpiredSession()
        }
        return false
      } finally {
        refreshCookiePromiseRef.current = null
      }
    })()

    refreshCookiePromiseRef.current = request
    return request
  }, [clearExpiredSession, markSessionHeartbeat])

  const refreshUser = useCallback(async () => {
    if (logoutInProgressRef.current) return null

    if (refreshUserPromiseRef.current) {
      return refreshUserPromiseRef.current
    }

    if (user && Date.now() - lastFullUserRefreshAtRef.current < REFRESH_USER_DEBOUNCE_MS) {
      return user
    }

    const request = (async () => {
      try {
        const res = await authMe()

        if (logoutInProgressRef.current) return null

        const fresh = toFrontendUser(res.user)
        const remember = typeof window !== "undefined" && !!safeLocalStorageGet(PERSIST_KEY)

        writeStoredUser(fresh, remember)
        setUser(fresh)
        setIsLoggingOut(false)
        setSessionExpired(false)
        setIsSessionVerified(true)
        setIsServerOffline(false)
        lastFullUserRefreshAtRef.current = Date.now()
        markSessionHeartbeat()

        return fresh
      } catch (err: any) {
        if (err instanceof NetworkError || err?.name === "NetworkError") {
          setIsServerOffline(true)
          throw err
        }

        const isUnauthorized = err instanceof ApiError && (err.status === 401 || err.status === 403)

        if (isUnauthorized) {
          const recovered = await refreshSessionCookie()
          if (recovered && !logoutInProgressRef.current) {
            try {
              const retry = await authMe()
              const fresh = toFrontendUser(retry.user)
              const remember = typeof window !== "undefined" && !!safeLocalStorageGet(PERSIST_KEY)
              writeStoredUser(fresh, remember)
              setUser(fresh)
              setIsLoggingOut(false)
              setSessionExpired(false)
              setIsSessionVerified(true)
              setIsServerOffline(false)
              lastFullUserRefreshAtRef.current = Date.now()
              markSessionHeartbeat()
              return fresh
            } catch (retryErr: any) {
              if (retryErr instanceof NetworkError || retryErr?.name === "NetworkError") {
                setIsServerOffline(true)
                throw retryErr
              }
            }
          }

          clearExpiredSession()
        }

        throw err
      } finally {
        refreshUserPromiseRef.current = null
      }
    })()

    refreshUserPromiseRef.current = request
    return request
  }, [clearExpiredSession, markSessionHeartbeat, refreshSessionCookie, user])

  // Hydrate from storage first, then verify with backend only when it is actually needed.
  // This avoids noisy 401 requests on public pages for logged-out visitors.
  useEffect(() => {
    try {
      const stored = readStoredUser()
      if (stored) {
        setUser(stored)
        setIsSessionVerified(false)
      }

      const initialPathname =
        typeof initialPathnameRef.current === "string" ? initialPathnameRef.current : ""
      const shouldVerifySession =
        isDashboardPath(initialPathname) || !!stored || (!isAuthPath(initialPathname) && hasAuthCookieMeta())

      if (!shouldVerifySession) {
        setIsLoading(false)
        setIsLoggingOut(false)
        setIsServerOffline(false)
        return
      }

      const init = async () => {
        setIsLoading(true)
        try {
          const res = await authSession()

          if (logoutInProgressRef.current) return

          const fresh = toFrontendUser(res.user)

          // If user was stored with remember flag, keep it remembered
          const remember = typeof window !== "undefined" && !!safeLocalStorageGet(PERSIST_KEY)
          writeStoredUser(fresh, remember)

          setUser(fresh)
          setIsLoggingOut(false)
          setSessionExpired(false)
          setIsSessionVerified(true)
          setIsServerOffline(false)
          markSessionHeartbeat()
        } catch (err: any) {
          if (err instanceof NetworkError || err?.name === "NetworkError") {
            setIsServerOffline(true)
            return
          }

          const hadUser = !!stored

          // STRICT CHECK: Is it explicitly an auth rejection?
          const isUnauthorized = err instanceof ApiError && (err.status === 401 || err.status === 403)

          if (isUnauthorized) {
            const recovered = await refreshSessionCookie()
            if (recovered && !logoutInProgressRef.current) {
              try {
                const retry = await authSession()
                const fresh = toFrontendUser(retry.user)
                const remember = typeof window !== "undefined" && !!safeLocalStorageGet(PERSIST_KEY)
                writeStoredUser(fresh, remember)
                setUser(fresh)
                setIsLoggingOut(false)
                setSessionExpired(false)
                setIsSessionVerified(true)
                setIsServerOffline(false)
                markSessionHeartbeat()
                return
              } catch (retryErr: any) {
                if (retryErr instanceof NetworkError || retryErr?.name === "NetworkError") {
                  setIsServerOffline(true)
                  return
                }
              }
            }

            clearStoredUser()
            setUser(null)
            setIsLoggingOut(false)
            setIsSessionVerified(false)
            if (hadUser) {
              setSessionExpired(true)
              broadcastAuthEvent({ type: "logout", reason: "session_expired", at: Date.now() })
            }
          } else {
            // 5xx errors, timeouts, or unexpected failures should not wipe the local session.
            console.error("Transient backend or network error while verifying session:", err)
          }
        } finally {
          setIsLoading(false)
        }
      }

      void init()
    } catch (error) {
      console.error("Auth bootstrap failed:", error)
      setUser(null)
      setIsLoading(false)
      setIsLoggingOut(false)
      setIsSessionVerified(false)
      setSessionExpired(false)
      setIsServerOffline(false)
    }
  }, [isAuthPath, isDashboardPath, markSessionHeartbeat, refreshSessionCookie])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== AUTH_EVENT_KEY || !event.newValue) return

      try {
        const payload = JSON.parse(event.newValue) as Partial<AuthBroadcastEvent>

        if (payload.type === "logout") {
          logoutInProgressRef.current = true
          clearStoredUser()
          setUser(null)
          setIsLoading(false)
          setIsLoggingOut(payload.reason === "user_initiated")
          setIsSessionVerified(false)
          setSessionExpired(payload.reason === "session_expired")
          setIsServerOffline(false)
          if (payload.reason === "user_initiated") {
            completeLogoutNavigation()
          } else if (!isAuthPath(pathname)) {
            redirectToLogin()
          }
          return
        }

        if (payload.type === "login") {
          logoutInProgressRef.current = false
          setIsLoggingOut(false)

          const syncedUser = parseStoredUser(safeLocalStorageGet(PERSIST_KEY))
          if (syncedUser) {
            setUser(syncedUser)
            setIsSessionVerified(false)
            setSessionExpired(false)
            setIsServerOffline(false)
          }

          void refreshUser().catch(() => null)
        }
      } catch {
        // Ignore malformed cross-tab auth events.
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [completeLogoutNavigation, isAuthPath, pathname, redirectToLogin, refreshUser])

  // Basic route protection
  useEffect(() => {
    if (isLoading || logoutInProgressRef.current) return

    const protectedRoutes = ["/dashboard"]
    const currentPathname = typeof pathname === "string" ? pathname : ""
    const isProtectedRoute = protectedRoutes.some((route) => currentPathname.startsWith(route))

    if (isProtectedRoute && !user) {
      const search = typeof window !== "undefined" ? window.location.search : ""
      const hash = typeof window !== "undefined" ? window.location.hash : ""
      const redirectTarget = `${currentPathname}${search}${hash}`
      router.replace(`/auth/login?redirect=${encodeURIComponent(redirectTarget)}`)
    }
  }, [user, isLoading, pathname, router])

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Browser is closing - flag for next load (legacy behavior)
          safeSessionStorageSet("mal3bk_session_end", "true")
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  useEffect(() => {
    const currentPathname = typeof pathname === "string" ? pathname : ""
    if (!isServerOffline || !isDashboardPath(currentPathname)) {
      setShowConnectivityOverlay(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setShowConnectivityOverlay(true)
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [isDashboardPath, isServerOffline, pathname])

  // Refresh the JWT cookie proactively on dashboard routes, but avoid duplicate refresh storms.
  useEffect(() => {
    const currentPathname = typeof pathname === "string" ? pathname : ""
    if (!user || !isDashboardPath(currentPathname)) return

    const maybeRefreshSessionCookie = async (force = false) => {
      if (logoutInProgressRef.current) return false
      if (!force && Date.now() - lastSessionHeartbeatRef.current < VISIBILITY_REFRESH_THRESHOLD_MS) {
        return true
      }
      return refreshSessionCookie()
    }

    const intervalId = setInterval(() => {
      void maybeRefreshSessionCookie(true)
    }, SESSION_REFRESH_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void maybeRefreshSessionCookie(false)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isDashboardPath, pathname, refreshSessionCookie, user])

  const login = useCallback(async (email: string, password: string, remember?: boolean) => {
    logoutInProgressRef.current = false
    setIsLoading(true)
    setIsLoggingOut(false)

    try {
      const res = await authLogin({ email, password, remember })
      const fresh = toFrontendUser(res.user)

      writeStoredUser(fresh, remember)
      setUser(fresh)
      setIsLoggingOut(false)
      setSessionExpired(false)
      setIsSessionVerified(true)
      setIsServerOffline(false)
      markSessionHeartbeat()
      broadcastAuthEvent({ type: "login", at: Date.now() })
      // Navigation is performed by the caller as a hard window.location navigation
      // so the freshly issued auth cookies are guaranteed to be attached to the next
      // request (mobile Safari sometimes loses an RSC navigation that happens in the
      // same tick as the Set-Cookie response, causing a "page couldn't load" error
      // followed by an automatic login on Back).
      return fresh
    } catch (err: any) {
      if (err?.name === "NetworkError") {
        setIsServerOffline(true)
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [markSessionHeartbeat])

  const register = useCallback(async (data: RegisterData) => {
    logoutInProgressRef.current = false
    setIsLoading(true)
    setIsLoggingOut(false)

    try {
      const res = await authRegister({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
      })
      const fresh = toFrontendUser(res.user)

      // Default newly-registered users to "remembered" so they stay signed in
      // across browser restarts. Same UX as most modern apps after sign-up.
      writeStoredUser(fresh, true)
      setUser(fresh)
      setIsLoggingOut(false)
      setSessionExpired(false)
      setIsSessionVerified(true)
      setIsServerOffline(false)
      markSessionHeartbeat()
      broadcastAuthEvent({ type: "login", at: Date.now() })
      return fresh
    } catch (err: any) {
      if (err?.name === "NetworkError") {
        setIsServerOffline(true)
      }
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [markSessionHeartbeat])

  const logout = useCallback(async () => {
    logoutInProgressRef.current = true
    setIsLoggingOut(true)
    setSessionExpired(false)
    clearStoredUser()
    setUser(null)
    setIsLoading(false)
    setIsSessionVerified(false)
    setIsServerOffline(false)
    broadcastAuthEvent({ type: "logout", reason: "user_initiated", at: Date.now() })

    try {
      await authLogout()
    } catch (err: any) {
      if (err instanceof NetworkError || err?.name === "NetworkError") {
        setIsServerOffline(true)
        toast.error("Logged out locally; server unavailable")
      } else {
        console.error("Logout failed:", err)
        toast.error("Logged out locally")
      }
    } finally {
      completeLogoutNavigation()
    }
  }, [completeLogoutNavigation])

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null
      const updated = { ...prev, ...data }

      const remember = typeof window !== "undefined" && !!safeLocalStorageGet(PERSIST_KEY)
      writeStoredUser(updated, remember)

      return updated
    })
  }, [])

  const checkConnection = useCallback(async () => {
    setIsRetrying(true)
    try {
      await refreshUser()
      router.refresh()
    } catch (err: any) {
      if (err?.name !== "NetworkError") {
        setIsServerOffline(false)
      }
    } finally {
      setIsRetrying(false)
    }
  }, [refreshUser, router])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isLoggingOut,
        login,
        register,
        logout,
        updateUser,
        refreshUser,
        sessionExpired,
        setSessionExpired,
        isSessionVerified,
        isServerOffline,
        checkConnection,
      }}
    >
      {children}
      <ConnectivityError isVisible={showConnectivityOverlay} onRetry={checkConnection} isRetrying={isRetrying} />
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
