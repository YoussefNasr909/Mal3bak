import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { ApiUser } from "@/lib/api"

import { sanitizeInternalRedirect } from "@/lib/auth-routing"
import { config } from "@/lib/config"

const SERVER_AUTH_TIMEOUT_MS = 5000
type RequestHeaderReader = Pick<Headers, "get">

function normalizeOrigin(value: string | null | undefined) {
  return String(value || "").trim().replace(/\/+$/, "")
}

function firstHeaderValue(value: string | null | undefined) {
  return String(value || "").split(",")[0]?.trim() || ""
}

function resolveRequestOrigin(requestHeaders: RequestHeaderReader) {
  const origin = normalizeOrigin(requestHeaders.get("origin"))
  if (origin) return origin

  const host = firstHeaderValue(requestHeaders.get("x-forwarded-host")) || firstHeaderValue(requestHeaders.get("host"))
  if (host) {
    const proto = firstHeaderValue(requestHeaders.get("x-forwarded-proto")) || (process.env.NODE_ENV === "production" ? "https" : "http")
    return `${proto}://${host}`
  }

  return normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL)
}

function getForwardedClientHeaders(requestHeaders: RequestHeaderReader) {
  const forwardedHeaders: Record<string, string> = {}
  const forwardedFor = requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip")
  const forwardedHost = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  const forwardedProto = requestHeaders.get("x-forwarded-proto")

  if (forwardedFor) forwardedHeaders["X-Forwarded-For"] = forwardedFor
  if (forwardedHost) forwardedHeaders["X-Forwarded-Host"] = forwardedHost
  if (forwardedProto) forwardedHeaders["X-Forwarded-Proto"] = forwardedProto

  return forwardedHeaders
}

function buildLoginRedirectTarget(pathname: string | null | undefined, search: string | null | undefined) {
  const safeSearch = typeof search === "string" && search.startsWith("?") ? search : ""
  const safeTarget = sanitizeInternalRedirect(pathname, undefined, "/")
  const target = safeTarget === "/" ? safeTarget : `${safeTarget}${safeSearch}`
  return `/auth/login?redirect=${encodeURIComponent(target)}`
}

function getSetCookieHeaders(response: Response): string[] {
  const anyHeaders = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie()
  }
  // Fallback only safe if there's a single Set-Cookie. With multiple cookies
  // Headers.get() concatenates them with ", " which we cannot reliably split.
  // Better to skip server-side refresh than to mis-parse cookies.
  return []
}

function mergeCookies(existingCookieHeader: string, setCookies: string[]): string {
  const cookieMap = new Map<string, string>()

  for (const part of existingCookieHeader.split(";")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx <= 0) continue
    cookieMap.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1))
  }

  for (const setCookie of setCookies) {
    const firstPart = setCookie.split(";")[0]
    const eqIdx = firstPart.indexOf("=")
    if (eqIdx <= 0) continue
    const name = firstPart.slice(0, eqIdx).trim()
    const value = firstPart.slice(eqIdx + 1).trim()
    if (!name) continue
    if (value === "") {
      cookieMap.delete(name)
    } else {
      cookieMap.set(name, value)
    }
  }

  const result: string[] = []
  for (const [name, value] of cookieMap) {
    result.push(`${name}=${value}`)
  }
  return result.join("; ")
}

async function tryServerRefresh(cookieHeader: string, requestHeaders?: RequestHeaderReader): Promise<string | null> {
  const baseUrl = config.serverApiUrl
  if (!baseUrl) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SERVER_AUTH_TIMEOUT_MS)

  try {
    const requestOrigin = requestHeaders ? resolveRequestOrigin(requestHeaders) : undefined
    const refreshHeaders: Record<string, string> = requestHeaders ? getForwardedClientHeaders(requestHeaders) : {}
    refreshHeaders["ngrok-skip-browser-warning"] = "true"
    if (cookieHeader) refreshHeaders.Cookie = cookieHeader
    if (requestOrigin) {
      refreshHeaders.Origin = requestOrigin
      refreshHeaders.Referer = `${requestOrigin}/`
    }

    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: refreshHeaders,
      cache: "no-store",
      signal: controller.signal,
    })

    if (!res.ok) return null

    const setCookies = getSetCookieHeaders(res)
    if (setCookies.length === 0) return null

    return mergeCookies(cookieHeader, setCookies)
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchSessionUser(cookieHeader: string, allowRefresh = true, requestHeaders?: RequestHeaderReader): Promise<ApiUser | null> {
  const baseUrl = config.serverApiUrl
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SERVER_AUTH_TIMEOUT_MS)

  let res: Response
  try {
    const sessionHeaders: Record<string, string> = {
      "ngrok-skip-browser-warning": "true",
    }
    if (cookieHeader) sessionHeaders.Cookie = cookieHeader

    res = await fetch(`${baseUrl}/auth/session`, {
      headers: sessionHeaders,
      cache: "no-store",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  // If the access token has expired but we still hold a valid refresh token,
  // refresh server-side and retry the session call so we don't bounce the user
  // through /auth/login on every dashboard navigation.
  if (res.status === 401 && allowRefresh) {
    const refreshedCookieHeader = await tryServerRefresh(cookieHeader, requestHeaders)
    if (refreshedCookieHeader) {
      return fetchSessionUser(refreshedCookieHeader, false, requestHeaders)
    }
  }

  if (!res.ok) return null

  const data = await res.json()
  return data.user ?? null
}

export async function getServerSessionUser(): Promise<ApiUser | null> {
  try {
    const requestHeaders = await headers()
    const cookieHeader = requestHeaders.get("cookie") ?? ""
    if (!cookieHeader.trim()) return null
    return await fetchSessionUser(cookieHeader, true, requestHeaders)
  } catch {
    return null
  }
}

export async function requireDashboardUser(): Promise<ApiUser> {
  const user = await getServerSessionUser()
  if (!user) {
    const requestHeaders = await headers()
    redirect(buildLoginRedirectTarget(requestHeaders.get("x-pathname"), requestHeaders.get("x-search")))
  }

  return user as ApiUser
}

export async function requireRole(role: "admin" | "manager" | "player"): Promise<ApiUser> {
  const user = await requireDashboardUser()
  if (user.role !== role) {
    redirect(`/dashboard/${user.role}`)
  }
  return user
}
