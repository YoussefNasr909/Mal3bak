import type { Notification, NotificationPriority } from "@/lib/types"

export type NotificationGroupKey = "today" | "earlier"

export type NotificationGroup = {
  key: NotificationGroupKey
  items: Notification[]
}

const PRIORITY_WEIGHT: Record<NotificationPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN
  return Date.parse(value)
}

function isImportantNotification(notification: Notification) {
  return notification.priority === "high" || notification.priority === "urgent"
}

function isSameCalendarDay(date: Date, reference: Date) {
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

function getNotificationGroupKey(notification: Notification, now = new Date()): NotificationGroupKey {

  const createdAt = new Date(notification.createdAt)
  if (!Number.isNaN(createdAt.getTime()) && isSameCalendarDay(createdAt, now)) {
    return "today"
  }

  return "earlier"
}

export function compareNotifications(a: Notification, b: Notification) {
  const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  if (priorityDelta !== 0) {
    return priorityDelta
  }

  const aUnread = !a.readAt
  const bUnread = !b.readAt
  if (aUnread !== bUnread) {
    return aUnread ? -1 : 1
  }

  const createdDelta = toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
  if (!Number.isNaN(createdDelta) && createdDelta !== 0) {
    return createdDelta
  }

  const updatedDelta = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)
  if (!Number.isNaN(updatedDelta) && updatedDelta !== 0) {
    return updatedDelta
  }

  return a.id.localeCompare(b.id)
}

export function sortNotifications(items: Notification[]) {
  return [...items].sort(compareNotifications)
}

export function groupNotifications(items: Notification[], now = new Date()): NotificationGroup[] {
  const grouped = {
    today: [] as Notification[],
    earlier: [] as Notification[],
  }

  for (const notification of sortNotifications(items)) {
    grouped[getNotificationGroupKey(notification, now)].push(notification)
  }

  return [
    { key: "today" as const, items: grouped.today },
    { key: "earlier" as const, items: grouped.earlier },
  ].filter((group) => group.items.length > 0)
}

export function getNotificationGroupLabel(key: NotificationGroupKey, language: "ar" | "en") {
  const labels = {

    today: { ar: "اليوم", en: "Today" },
    earlier: { ar: "أقدم", en: "Earlier" },
  } as const

  return labels[key][language]
}

export function getNotificationActionLabel(notification: Notification, language: "ar" | "en") {
  if (notification.category === "booking") {
    return language === "ar" ? "عرض الحجز" : "View booking"
  }

  if (notification.category === "tournament") {
    return language === "ar" ? "عرض البطولة" : "View tournament"
  }

  return language === "ar" ? "فتح التفاصيل" : "Open details"
}

export function getNotificationPriorityLabel(priority: NotificationPriority, language: "ar" | "en") {
  const labels = {
    urgent: { ar: "عاجل", en: "Urgent" },
    high: { ar: "مهم", en: "High" },
    normal: { ar: "عادي", en: "Normal" },
    low: { ar: "منخفض", en: "Low" },
  } as const

  return labels[priority][language]
}
