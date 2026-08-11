import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationProvider, useNotifications } from "@/components/providers/notification-provider"
import { NOTIFICATIONS_REFRESH_EVENT, NetworkError } from "@/lib/api"
import * as api from "@/lib/api"
import * as authProvider from "@/components/providers/auth-provider"

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    deleteNotification: vi.fn(),
    getNotificationPreferences: vi.fn(),
    listNotifications: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    markNotificationRead: vi.fn(),
  }
})

function Wrapper({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>
}

function ErrorProbe() {
  const { loadError } = useNotifications()

  return (
    <div>{loadError ? loadError.message : "no-error"}</div>
  )
}

function MarkAsReadProbe({ notificationId }: { notificationId: string }) {
  const { markAsRead } = useNotifications()

  return (
    <button type="button" onClick={() => void markAsRead(notificationId)}>
      Mark read
    </button>
  )
}

function SummaryProbe() {
  const { unreadCount, summary } = useNotifications()

  return (
    <div>
      unread:{unreadCount};booking:{summary?.byCategory.booking ?? -1};urgent:{summary?.urgentUnreadCount ?? -1}
    </div>
  )
}

describe("NotificationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    })

    ;(authProvider.useAuth as any).mockReturnValue({
      user: { id: "player-1", role: "player" },
      isAuthenticated: true,
    })
    ;(api.getNotificationPreferences as any).mockResolvedValue({
      preferences: {
        inAppEnabled: true,
        webPushEnabled: false,
        criticalOnlyOnPush: true,
      },
      push: {
        configured: true,
        vapidPublicKey: "public-key",
        subscriptionCount: 0,
        subscriptions: [],
      },
    })
  })

  it("refreshes notifications when auth becomes ready after an initial logged-out render", async () => {
    let authState: { user: { id: string; role: string } | null; isAuthenticated: boolean } = {
      user: null,
      isAuthenticated: false,
    }

    ;(authProvider.useAuth as any).mockImplementation(() => authState)
    ;(api.listNotifications as any).mockResolvedValue({
      items: [],
      unreadCount: 0,
      total: 0,
      page: 1,
      limit: 8,
      pages: 1,
      summary: {
        unreadCount: 0,
        urgentUnreadCount: 0,
        byCategory: {
          booking: 0,
          tournament: 0,
          account: 0,
          system: 0,
          admin: 0,
        },
      },
    })

    const { rerender } = render(<Wrapper><div>child</div></Wrapper>)

    expect(api.listNotifications).not.toHaveBeenCalled()

    authState = {
      user: { id: "player-1", role: "player" },
      isAuthenticated: true,
    }

    rerender(<Wrapper><div>child</div></Wrapper>)

    await waitFor(() => {
      expect(api.listNotifications).toHaveBeenCalledTimes(1)
    })
  })

  it("deduplicates overlapping refresh requests from mount and browser events", async () => {
    let resolveList = (_value: {
      items: []
      unreadCount: number
      total: number
      page: number
      limit: number
      pages: number
      summary: {
        unreadCount: number
        urgentUnreadCount: number
        byCategory: {
          booking: number
          tournament: number
          account: number
          system: number
          admin: number
        }
      }
    }) => {}
    ;(api.listNotifications as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )

    render(<Wrapper><div>child</div></Wrapper>)

    await waitFor(() => {
      expect(api.listNotifications).toHaveBeenCalledTimes(1)
    })

    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT))

    expect(api.listNotifications).toHaveBeenCalledTimes(1)

    resolveList({
      items: [],
      unreadCount: 0,
      total: 0,
      page: 1,
      limit: 8,
      pages: 1,
      summary: {
        unreadCount: 0,
        urgentUnreadCount: 0,
        byCategory: {
          booking: 0,
          tournament: 0,
          account: 0,
          system: 0,
          admin: 0,
        },
      },
    })

    await waitFor(() => {
      expect(api.listNotifications).toHaveBeenCalledTimes(1)
    })
  })

  it("surfaces refresh failures to notification consumers", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    ;(api.listNotifications as any).mockRejectedValue(new NetworkError())

    render(
      <Wrapper>
        <ErrorProbe />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("Network connection failed")).toBeInTheDocument()
    })

    consoleErrorSpy.mockRestore()
  })

  it("marks a notification as read even when it is outside the recent bell list", async () => {
    ;(api.listNotifications as any).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 8,
      pages: 1,
      unreadCount: 1,
      summary: {
        unreadCount: 1,
        urgentUnreadCount: 0,
        byCategory: {
          booking: 1,
          tournament: 0,
          account: 0,
          system: 0,
          admin: 0,
        },
      },
    })
    ;(api.markNotificationRead as any).mockResolvedValue({
      notification: {
        id: "older-notification",
        userId: "player-1",
        category: "booking",
        priority: "normal",
        eventKey: "booking_updated",
        title: "Older notification",
        message: "Older notification body",
        type: "info",
        readAt: "2026-04-05T10:00:00.000Z",
        createdAt: "2026-04-05T09:00:00.000Z",
        updatedAt: "2026-04-05T10:00:00.000Z",
      },
      unreadCount: 0,
    })

    render(
      <Wrapper>
        <MarkAsReadProbe notificationId="older-notification" />
        <SummaryProbe />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(api.listNotifications).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByText("unread:1;booking:1;urgent:0")).toBeInTheDocument()
    })

    screen.getByRole("button", { name: "Mark read" }).click()

    await waitFor(() => {
      expect(api.markNotificationRead).toHaveBeenCalledWith("older-notification", { emitRefresh: false })
    })

    await waitFor(() => {
      expect(screen.getByText("unread:0;booking:0;urgent:0")).toBeInTheDocument()
    })
  })
})
