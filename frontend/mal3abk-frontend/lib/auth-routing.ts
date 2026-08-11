import type { AuthRole } from "@/lib/api"

export function getDefaultDashboardPath(role: AuthRole) {
  return role === "admin" ? "/dashboard/admin" : role === "manager" ? "/dashboard/manager" : "/dashboard/player"
}

export function sanitizeInternalRedirect(rawRedirect: string | null | undefined, role?: AuthRole, fallback = "/") {
  const normalizedFallback = role ? getDefaultDashboardPath(role) : fallback

  if (!rawRedirect) return normalizedFallback
  if (!rawRedirect.startsWith("/")) return normalizedFallback
  if (rawRedirect.startsWith("//")) return normalizedFallback
  if (rawRedirect === "/dashboard") return normalizedFallback
  if (rawRedirect === "/auth/login") return normalizedFallback
  if (rawRedirect.startsWith("/auth/")) return normalizedFallback

  return rawRedirect
}

export function shouldAutoRedirectAuthenticatedAuthUser({
  isLoading,
  hasUser,
  isServerOffline,
  isSessionVerified,
  requestedRedirect,
}: {
  isLoading: boolean
  hasUser: boolean
  isServerOffline?: boolean
  isSessionVerified?: boolean
  requestedRedirect?: string | null
}) {
  if (isLoading || !hasUser) return false
  if (isServerOffline) return false
  // A redirect param means a server guard already rejected a protected request.
  // Trust that server signal over client-side stored user state to avoid loops,
  // but allow the bounce once the client has verified the session with the API.
  if (requestedRedirect && !isSessionVerified) return false
  return true
}
