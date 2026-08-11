import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationsPage } from "@/components/dashboard/notifications-page"
import { NetworkError, NOTIFICATIONS_REFRESH_EVENT } from "@/lib/api"

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
}))

const mockNotificationsContext = vi.hoisted(() => ({
  unreadCount: 0,
  urgentUnreadCount: 0,
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
  preferences: {
    inAppEnabled: true,
    webPushEnabled: false,
    criticalOnlyOnPush: true,
  },
  pushState: {
    configured: true,
    vapidPublicKey: "public-key",
    subscriptionCount: 0,
    subscriptions: [],
  },
  pushPermission: "default" as const,
  pushSupport: { supported: true, reason: null },
  pushError: null as Error | null,
  isPreferencesLoading: false,
  isUpdatingPushPreferences: false,
  refreshNotifications: vi.fn(),
  setWebPushEnabled: vi.fn(),
  setCriticalOnlyOnPush: vi.fn(),
}))

function createNotification(id: string, overrides: Partial<import("@/lib/types").Notification> = {}) {
  return {
    id,
    userId: "player-1",
    category: "booking" as const,
    priority: "normal" as const,
    eventKey: "booking_confirmed",
    title: `Notification ${id}`,
    message: `Message ${id}`,
    type: "info" as const,
    createdAt: "2026-04-05T10:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z",
    ...overrides,
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    direction: "ltr",
  }),
}))

vi.mock("@/components/providers/notification-provider", () => ({
  useNotifications: () => ({
    unreadCount: mockNotificationsContext.unreadCount,
    urgentUnreadCount: mockNotificationsContext.urgentUnreadCount,
    summary: mockNotificationsContext.summary,
    preferences: mockNotificationsContext.preferences,
    pushState: mockNotificationsContext.pushState,
    pushPermission: mockNotificationsContext.pushPermission,
    pushSupport: mockNotificationsContext.pushSupport,
    pushError: mockNotificationsContext.pushError,
    isPreferencesLoading: mockNotificationsContext.isPreferencesLoading,
    isUpdatingPushPreferences: mockNotificationsContext.isUpdatingPushPreferences,
    refreshNotifications: mockNotificationsContext.refreshNotifications,
    setWebPushEnabled: mockNotificationsContext.setWebPushEnabled,
    setCriticalOnlyOnPush: mockNotificationsContext.setCriticalOnlyOnPush,
  }),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    deleteNotification: vi.fn(),
    clearReadNotifications: vi.fn(),
  }
})

describe("NotificationsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockNotificationsContext.unreadCount = 0
    mockNotificationsContext.urgentUnreadCount = 0
    mockNotificationsContext.refreshNotifications.mockResolvedValue(undefined)
    mockNotificationsContext.setWebPushEnabled.mockResolvedValue(true)
    mockNotificationsContext.setCriticalOnlyOnPush.mockResolvedValue(true)
  })

  it("shows a retry state when notifications fail to load and recovers after retry", async () => {
    const api = await import("@/lib/api")
    ;(api.listNotifications as any)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        pages: 1,
        unreadCount: 0,
        summary: mockNotificationsContext.summary,
      })

    render(<NotificationsPage />)

    await waitFor(() => {
      expect(screen.getByText("Couldn't load notifications")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))

    await waitFor(() => {
      expect(screen.getByText("No notifications here yet")).toBeInTheDocument()
    })
  })

  it("ignores stale notification responses when a newer filter request finishes first", async () => {
    const api = await import("@/lib/api")
    let resolveFirst!: (value: any) => void
    let resolveSecond!: (value: any) => void

    ;(api.listNotifications as any)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve
      }))

    render(<NotificationsPage />)

    const unreadTab = screen.getByRole("tab", { name: "Unread" })
    unreadTab.focus()
    fireEvent.keyDown(unreadTab, { key: "Enter", code: "Enter" })

    await waitFor(() => {
      expect(unreadTab).toHaveAttribute("aria-selected", "true")
    })

    await waitFor(() => {
      expect(api.listNotifications).toHaveBeenCalledTimes(2)
    })

    resolveSecond({
      items: [createNotification("unread", { title: "Unread notification", readAt: null })],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 1,
      summary: {
        ...mockNotificationsContext.summary,
        unreadCount: 1,
        byCategory: { ...mockNotificationsContext.summary.byCategory, booking: 1 },
      },
    })

    await waitFor(() => {
      expect(screen.getByText("Unread notification")).toBeInTheDocument()
    })

    resolveFirst({
      items: [createNotification("all", { title: "All notification" })],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 0,
      summary: mockNotificationsContext.summary,
    })

    await waitFor(() => {
      expect(screen.queryByText("All notification")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Unread notification")).toBeInTheDocument()
  })

  it("keeps the current list visible when a background refresh fails", async () => {
    const api = await import("@/lib/api")
    ;(api.listNotifications as any).mockResolvedValue({
      items: [createNotification("saved", { title: "Saved notification" })],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 0,
      summary: mockNotificationsContext.summary,
    })

    render(<NotificationsPage />)

    await waitFor(() => {
      expect(api.listNotifications).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Saved notification/i })).toBeInTheDocument()
    })

    ;(api.listNotifications as any).mockRejectedValueOnce(new NetworkError())

    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT))

    await waitFor(() => {
      expect(screen.getByText("Showing your latest saved notifications")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: /Saved notification/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument()
  })

  it("marks an older notification as read without reloading the current page list", async () => {
    const api = await import("@/lib/api")
    mockNotificationsContext.unreadCount = 1

    ;(api.listNotifications as any).mockResolvedValue({
      items: [createNotification("older", { title: "Older unread", readAt: null })],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 1,
      summary: {
        ...mockNotificationsContext.summary,
        unreadCount: 1,
        byCategory: { ...mockNotificationsContext.summary.byCategory, booking: 1 },
      },
    })
    ;(api.markNotificationRead as any).mockResolvedValue({
      notification: createNotification("older", {
        title: "Older unread",
        readAt: "2026-04-05T11:00:00.000Z",
      }),
      unreadCount: 0,
    })

    render(<NotificationsPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Older unread/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Older unread/i }))

    await waitFor(() => {
      expect(api.markNotificationRead).toHaveBeenCalledWith("older", { emitRefresh: false })
    })

    expect(api.listNotifications).toHaveBeenCalledTimes(1)
    expect(mockNotificationsContext.refreshNotifications).toHaveBeenCalledWith({ silent: true })
  })

  it("asks for confirmation before deleting a notification", async () => {
    const api = await import("@/lib/api")

    ;(api.listNotifications as any).mockResolvedValue({
      items: [createNotification("delete-me", { title: "Delete me" })],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 0,
      summary: mockNotificationsContext.summary,
    })
    ;(api.deleteNotification as any).mockResolvedValue({
      deletedId: "delete-me",
      unreadCount: 0,
    })

    render(<NotificationsPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Delete me/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete notification" }))

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    })

    expect(api.deleteNotification).not.toHaveBeenCalled()

    const dialog = screen.getByRole("alertdialog")
    expect(within(dialog).getByText("Delete notification?")).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete notification" }))

    await waitFor(() => {
      expect(api.deleteNotification).toHaveBeenCalledWith("delete-me", { emitRefresh: false })
    })

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Delete me/i })).not.toBeInTheDocument()
    })

    expect(mockNotificationsContext.refreshNotifications).toHaveBeenCalledWith({ silent: true })
  })

  it("keeps a notification when delete confirmation is cancelled", async () => {
    const api = await import("@/lib/api")

    ;(api.listNotifications as any).mockResolvedValue({
      items: [createNotification("keep-me", { title: "Keep me" })],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 0,
      summary: mockNotificationsContext.summary,
    })

    render(<NotificationsPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Keep me/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete notification" }))

    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })

    expect(api.deleteNotification).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /Keep me/i })).toBeInTheDocument()
  })

  it("clears read notifications from the inbox", async () => {
    const api = await import("@/lib/api")
    mockNotificationsContext.unreadCount = 1

    ;(api.listNotifications as any).mockResolvedValue({
      items: [
        createNotification("read-one", {
          title: "Read one",
          readAt: "2026-04-05T11:00:00.000Z",
        }),
        createNotification("unread-one", {
          title: "Unread one",
          readAt: null,
        }),
      ],
      total: 2,
      page: 1,
      limit: 20,
      pages: 1,
      unreadCount: 1,
      summary: {
        ...mockNotificationsContext.summary,
        unreadCount: 1,
        byCategory: { ...mockNotificationsContext.summary.byCategory, booking: 1 },
      },
    })
    ;(api.clearReadNotifications as any).mockResolvedValue({
      deletedCount: 1,
      unreadCount: 1,
    })

    render(<NotificationsPage />)

    await waitFor(() => {
      expect(screen.getByText("Read one")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Clear read" }))

    await waitFor(() => {
      expect(api.clearReadNotifications).toHaveBeenCalledWith({ emitRefresh: false })
    })

    await waitFor(() => {
      expect(screen.queryByText("Read one")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Unread one")).toBeInTheDocument()
    expect(mockNotificationsContext.refreshNotifications).toHaveBeenCalledWith({ silent: true })
  })
})
