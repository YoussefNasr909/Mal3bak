import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationBell } from "@/components/dashboard/notification-bell"

const mockPush = vi.fn()
const mockUseNotifications = vi.fn()
const mockUseIsMobile = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    direction: "ltr",
  }),
}))

vi.mock("@/components/providers/notification-provider", () => ({
  useNotifications: () => mockUseNotifications(),
}))

vi.mock("@/components/ui/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseIsMobile.mockReturnValue(false)
  })

  it("loads notifications on first desktop open and shows a loading summary", async () => {
    const refreshNotifications = vi.fn().mockResolvedValue(undefined)
    const deleteNotificationItem = vi.fn().mockResolvedValue(true)

    mockUseNotifications.mockReturnValue({
      items: [],
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
      isLoading: true,
      hasLoaded: false,
      loadError: null,
      preferences: null,
      pushState: null,
      pushPermission: "default",
      pushSupport: { supported: true, reason: null },
      pushError: null,
      isPreferencesLoading: false,
      isUpdatingPushPreferences: false,
      refreshNotifications,
      refreshPreferences: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotificationItem,
      setWebPushEnabled: vi.fn(),
      setCriticalOnlyOnPush: vi.fn(),
    })

    render(<NotificationBell />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Notifications" }))

    await waitFor(() => {
      expect(refreshNotifications).toHaveBeenCalledWith({ silent: false })
    })

    expect(screen.getByText("Loading notifications...")).toBeInTheDocument()
  })

  it("uses the same popout on mobile and shows retry messaging when refreshes fail", async () => {
    const refreshNotifications = vi.fn().mockResolvedValue(undefined)
    const deleteNotificationItem = vi.fn().mockResolvedValue(true)
    mockUseIsMobile.mockReturnValue(true)

    mockUseNotifications.mockReturnValue({
      items: [],
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
      isLoading: false,
      hasLoaded: true,
      loadError: new Error("Temporary outage"),
      preferences: null,
      pushState: null,
      pushPermission: "default",
      pushSupport: { supported: true, reason: null },
      pushError: null,
      isPreferencesLoading: false,
      isUpdatingPushPreferences: false,
      refreshNotifications,
      refreshPreferences: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotificationItem,
      setWebPushEnabled: vi.fn(),
      setCriticalOnlyOnPush: vi.fn(),
    })

    render(<NotificationBell />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Notifications" }))

    await waitFor(() => {
      expect(refreshNotifications).toHaveBeenCalledWith({ silent: true })
    })

    expect(screen.getByText("Couldn't load notifications")).toBeInTheDocument()
    expect(screen.getByText("Temporary outage")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))

    await waitFor(() => {
      expect(refreshNotifications).toHaveBeenCalledWith({ silent: false })
    })
  })

  it("asks for confirmation before deleting a notification from the bell dropdown", async () => {
    const refreshNotifications = vi.fn().mockResolvedValue(undefined)
    const deleteNotificationItem = vi.fn().mockResolvedValue(true)

    mockUseNotifications.mockReturnValue({
      items: [
        {
          id: "notification-1",
          userId: "user-1",
          category: "booking",
          priority: "normal",
          eventKey: "booking_confirmed",
          title: "Booking confirmed",
          message: "Your booking is confirmed.",
          type: "info",
          createdAt: "2026-04-05T10:00:00.000Z",
          updatedAt: "2026-04-05T10:00:00.000Z",
          readAt: null,
        },
      ],
      unreadCount: 1,
      urgentUnreadCount: 0,
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
      isLoading: false,
      hasLoaded: true,
      loadError: null,
      preferences: null,
      pushState: null,
      pushPermission: "default",
      pushSupport: { supported: true, reason: null },
      pushError: null,
      isPreferencesLoading: false,
      isUpdatingPushPreferences: false,
      refreshNotifications,
      refreshPreferences: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotificationItem,
      setWebPushEnabled: vi.fn(),
      setCriticalOnlyOnPush: vi.fn(),
    })

    render(<NotificationBell />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Notifications" }))

    await waitFor(() => {
      expect(screen.getByText("Booking confirmed")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete notification" }))

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    })

    expect(deleteNotificationItem).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete notification" }))

    await waitFor(() => {
      expect(deleteNotificationItem).toHaveBeenCalledWith("notification-1")
    })
  })

  it("keeps the notification when bell delete confirmation is cancelled", async () => {
    const refreshNotifications = vi.fn().mockResolvedValue(undefined)
    const deleteNotificationItem = vi.fn().mockResolvedValue(true)

    mockUseNotifications.mockReturnValue({
      items: [
        {
          id: "notification-1",
          userId: "user-1",
          category: "booking",
          priority: "normal",
          eventKey: "booking_confirmed",
          title: "Booking confirmed",
          message: "Your booking is confirmed.",
          type: "info",
          createdAt: "2026-04-05T10:00:00.000Z",
          updatedAt: "2026-04-05T10:00:00.000Z",
          readAt: null,
        },
      ],
      unreadCount: 1,
      urgentUnreadCount: 0,
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
      isLoading: false,
      hasLoaded: true,
      loadError: null,
      preferences: null,
      pushState: null,
      pushPermission: "default",
      pushSupport: { supported: true, reason: null },
      pushError: null,
      isPreferencesLoading: false,
      isUpdatingPushPreferences: false,
      refreshNotifications,
      refreshPreferences: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotificationItem,
      setWebPushEnabled: vi.fn(),
      setCriticalOnlyOnPush: vi.fn(),
    })

    render(<NotificationBell />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Notifications" }))

    await waitFor(() => {
      expect(screen.getByText("Booking confirmed")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete notification" }))

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })

    expect(deleteNotificationItem).not.toHaveBeenCalled()
  })
})
