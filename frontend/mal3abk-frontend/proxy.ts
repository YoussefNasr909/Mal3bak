import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ACCESS_TOKEN_COOKIE = process.env.ACCESS_TOKEN_COOKIE || "mal3abi_access_token"
const REFRESH_TOKEN_COOKIE = process.env.REFRESH_TOKEN_COOKIE || "mal3abi_refresh_token"
const SESSION_REFRESH_TIMEOUT_MS = 5000

function getServerApiUrl() {
  const explicit = process.env.SERVER_API_URL
  if (explicit) return explicit.replace(/\/+$/, "")
  const backendProxy = process.env.BACKEND_PROXY_TARGET
  if (backendProxy) return `${backendProxy.replace(/\/+$/, "")}/api/v1`
  const publicApi = process.env.NEXT_PUBLIC_API_URL
  if (publicApi?.startsWith("http")) return publicApi.replace(/\/+$/, "")
  if (process.env.NODE_ENV === "production") return null
  return "http://localhost:4000/api/v1"
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    return JSON.parse(atob(padded)) as { exp?: number } | null
  } catch {
    return null
  }
}

function isAccessTokenExpired(token: string | undefined) {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return true
  const nowSeconds = Math.floor(Date.now() / 1000)
  return payload.exp <= nowSeconds + 15
}

function getSetCookieValues(res: Response) {
  const headersObject = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headersObject.getSetCookie === "function") {
    return headersObject.getSetCookie()
  }
  const combined = res.headers.get("set-cookie")
  if (!combined) return []
  return combined.split(/,(?=\s*[^;=]+=[^;]+)/g)
}

function extractCookieValue(setCookieHeaders: string[], cookieName: string) {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`${cookieName}=([^;]+)`))
    if (match?.[1]) return decodeURIComponent(match[1])
  }
  return null
}

function buildCookieHeader(request: NextRequest, overrides: Record<string, string | null>) {
  const cookies = new Map<string, string>()
  request.cookies.getAll().forEach((cookie: { name: string; value: string }) => cookies.set(cookie.name, cookie.value))

  Object.entries(overrides).forEach(([name, value]) => {
    if (!value) {
      cookies.delete(name)
    } else {
      cookies.set(name, value)
    }
  })

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
}

function getForwardedClientHeaders(request: NextRequest) {
  const forwardedHeaders: Record<string, string> = {}
  const forwardedFor = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(/:$/, "")

  if (forwardedFor) forwardedHeaders["X-Forwarded-For"] = forwardedFor
  if (forwardedHost) forwardedHeaders["X-Forwarded-Host"] = forwardedHost
  if (forwardedProto) forwardedHeaders["X-Forwarded-Proto"] = forwardedProto

  return forwardedHeaders
}

function shouldRefreshSessionForPath(pathname: string) {
  if (pathname.startsWith("/dashboard") || pathname === "/book" || pathname.startsWith("/book/")) {
    return true
  }

  if (!pathname.startsWith("/auth")) {
    return false
  }

  return pathname !== "/auth/logout"
}

async function maybeRefreshDashboardSession(request: NextRequest, requestHeaders: Headers) {
  const pathname = request.nextUrl.pathname
  const accessCookie = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshCookie = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  const serverApiUrl = getServerApiUrl()

  if (!shouldRefreshSessionForPath(pathname) || !refreshCookie || !isAccessTokenExpired(accessCookie) || !serverApiUrl) {
    return { requestHeaders, setCookieValues: [] as string[] }
  }

  const siteOrigin = request.nextUrl.origin
  let res: Response
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SESSION_REFRESH_TIMEOUT_MS)
  try {
    res = await fetch(`${serverApiUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        ...getForwardedClientHeaders(request),
        Cookie: buildCookieHeader(request, {
          [ACCESS_TOKEN_COOKIE]: accessCookie || null,
          [REFRESH_TOKEN_COOKIE]: refreshCookie,
        }),
        Origin: siteOrigin,
        Referer: `${siteOrigin}${pathname}`,
        "ngrok-skip-browser-warning": "true",
      },
      cache: "no-store",
      signal: controller.signal,
    })
  } catch {
    return { requestHeaders, setCookieValues: [] as string[] }
  } finally {
    clearTimeout(timeoutId)
  }

  const setCookieValues = getSetCookieValues(res)
  if (!setCookieValues.length) {
    return { requestHeaders, setCookieValues }
  }

  const nextAccess = extractCookieValue(setCookieValues, ACCESS_TOKEN_COOKIE)
  const nextRefresh = extractCookieValue(setCookieValues, REFRESH_TOKEN_COOKIE)
  requestHeaders.set(
    "cookie",
    buildCookieHeader(request, {
      [ACCESS_TOKEN_COOKIE]: nextAccess,
      [REFRESH_TOKEN_COOKIE]: nextRefresh,
    }),
  )

  return { requestHeaders, setCookieValues }
}

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", request.nextUrl.pathname)
  requestHeaders.set("x-search", request.nextUrl.search)
  requestHeaders.set("ngrok-skip-browser-warning", "true")

  const { requestHeaders: nextRequestHeaders, setCookieValues } = await maybeRefreshDashboardSession(request, requestHeaders)

  const response = NextResponse.next({
    request: {
      headers: nextRequestHeaders,
    },
  })

  for (const headerValue of setCookieValues) {
    response.headers.append("set-cookie", headerValue)
  }

  return response
}

export const config = {
  matcher: [
    {
      source: "/dashboard/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/auth/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/book/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
