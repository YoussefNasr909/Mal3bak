import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { config } from "@/lib/config"

const AUTH_META_COOKIE = "mal3bk_auth_meta"

function getExpiredCookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  } as const
}

async function forwardLogoutToBackend(request: NextRequest) {
  if (!config.serverApiUrl) return

  const cookieHeader = request.headers.get("cookie") ?? ""
  const origin = request.nextUrl.origin

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    await fetch(`${config.serverApiUrl}/auth/logout`, {
      method: "POST",
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        Origin: origin,
        Referer: `${origin}${request.nextUrl.pathname}`,
      },
      cache: "no-store",
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
  } catch {
    // Clearing browser cookies below is enough to break client-side redirect loops.
  }
}

function buildLogoutRedirectResponse() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: "/auth/login",
    },
  })

  response.cookies.set(config.accessTokenCookie, "", getExpiredCookieOptions(true))
  response.cookies.set(config.refreshTokenCookie, "", getExpiredCookieOptions(true))
  response.cookies.set(AUTH_META_COOKIE, "", getExpiredCookieOptions(false))

  return response
}

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  await forwardLogoutToBackend(request)
  return buildLogoutRedirectResponse()
}

export async function POST(request: NextRequest) {
  await forwardLogoutToBackend(request)
  return buildLogoutRedirectResponse()
}
