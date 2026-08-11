import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { NotificationList } from "@/components/dashboard/notifications/notification-list"
import type { Notification } from "@/lib/types"

const ARABIC_TITLE = "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u062C\u0632 \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631"
const ARABIC_MESSAGE =
  "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u062D\u062C\u0632 Arena 1 - SQUASH 6 \u0628\u062A\u0627\u0631\u064A\u062E 2026-04-01 \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631."

function toMojibake(value: string) {
  return Buffer.from(value, "utf8").toString("latin1")
}

function createNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notification-1",
    userId: "player-1",
    category: "booking",
    priority: "high",
    eventKey: "booking_missed",
    title: "Missed booking",
    titleAr: toMojibake(ARABIC_TITLE),
    message: "Arena 1 - SQUASH 6 on 2026-04-01 was marked as missed.",
    messageAr: toMojibake(ARABIC_MESSAGE),
    type: "warning",
    createdAt: "2026-04-05T10:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z",
    metadata: { status: "no_show" },
    ...overrides,
  }
}

describe("NotificationList", () => {
  it("renders the normalized notification copy returned by the backend", () => {
    render(
      <NotificationList
        items={[createNotification()]}
        language="en"
        direction="ltr"
        emptyTitle="No notifications"
        emptyDescription="You're all caught up."
        onOpenNotification={vi.fn()}
      />,
    )

    expect(screen.getByText("Missed booking")).toBeInTheDocument()
    expect(
      screen.getByText("Arena 1 - SQUASH 6 on 2026-04-01 was marked as missed."),
    ).toBeInTheDocument()
  })

  it("repairs mojibake Arabic notification text before rendering it", () => {
    render(
      <NotificationList
        items={[createNotification()]}
        language="ar"
        direction="rtl"
        emptyTitle="No notifications"
        emptyDescription="Nothing new."
        onOpenNotification={vi.fn()}
      />,
    )

    expect(screen.getByText(ARABIC_TITLE)).toBeInTheDocument()
    expect(screen.getByText(ARABIC_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText("Missed booking")).not.toBeInTheDocument()
  })

  it("renders valid Arabic notification copy when it is already available", () => {
    render(
      <NotificationList
        items={[
          createNotification({
            titleAr: ARABIC_TITLE,
            messageAr: ARABIC_MESSAGE,
          }),
        ]}
        language="ar"
        direction="rtl"
        emptyTitle="No notifications"
        emptyDescription="Nothing new."
        onOpenNotification={vi.fn()}
      />,
    )

    expect(screen.getByText(ARABIC_TITLE)).toBeInTheDocument()
    expect(screen.getByText(ARABIC_MESSAGE)).toBeInTheDocument()
  })
})
