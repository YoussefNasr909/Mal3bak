import { jest } from "@jest/globals";

import { prisma } from "../../src/db/prisma.js";
import {
  clearReadNotificationsService,
  createNotificationsTx,
  deleteNotificationService,
  normalizeNotificationCopy,
  updateNotificationPreferencesService,
} from "../../src/modules/notifications/notifications.service.js";

const MISSED_BOOKING_TITLE_AR =
  "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u062C\u0632 \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631";
const MISSED_BOOKING_MESSAGE_AR =
  "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u062D\u062C\u0632 Arena 1 - SQUASH 6 \u0628\u062A\u0627\u0631\u064A\u062E 2026-04-01 \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631.";

describe("notifications.service", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns early when the notification batch is empty", async () => {
    const tx = {
      notification: {
        createMany: jest.fn(),
      },
    };

    await expect(createNotificationsTx(tx, [{ title: "", message: "" }])).resolves.toEqual({ count: 0 });
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it("logs and swallows notification batch failures", async () => {
    const tx = {
      notification: {
        createMany: jest.fn().mockRejectedValue(new Error("createMany failed")),
      },
    };
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      createNotificationsTx(tx, [
        {
          userId: "user-1",
          title: "Notification title",
          message: "Notification body",
        },
      ]),
    ).resolves.toEqual({ count: 0 });

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user-1",
          actorUserId: null,
          type: "info",
          category: "system",
          priority: "normal",
          eventKey: "system_announcement",
          title: "Notification title",
          titleAr: null,
          message: "Notification body",
          messageAr: null,
          link: null,
          metadata: undefined,
        },
      ],
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("normalizes legacy missed-booking notifications to clear English and Arabic copy", () => {
    expect(
      normalizeNotificationCopy({
        category: "booking",
        title: "Booking marked as no-show",
        titleAr: "\u00D8\u00AA\u00D9\u2026 \u00D8\u00AA\u00D8\u00B3\u00D8\u00AC\u00D9\u0160\u00D9\u201E \u00D8\u00A7\u00D9\u201E\u00D8\u00AD\u00D8\u00AC\u00D8\u00B2 \u00D9\u0192\u00D8\u00B9\u00D8\u00AF\u00D9\u2026 \u00D8\u00AD\u00D8\u00B6\u00D9\u02C6\u00D8\u00B1",
        message: "Arena 1 - SQUASH 6 on 2026-04-01 was marked as a no-show.",
        messageAr:
          "\u00D8\u00AA\u00D9\u2026 \u00D8\u00AA\u00D8\u00B3\u00D8\u00AC\u00D9\u0160\u00D9\u201E \u00D8\u00AD\u00D8\u00AC\u00D8\u00B2 Arena 1 - SQUASH 6 \u00D8\u00A8\u00D8\u00AA\u00D8\u00A7\u00D8\u00B1\u00D9\u0160\u00D8\u00AE 2026-04-01 \u00D9\u0192\u00D8\u00B9\u00D8\u00AF\u00D9\u2026 \u00D8\u00AD\u00D8\u00B6\u00D9\u02C6\u00D8\u00B1.",
        metadata: { status: "no_show" },
      }),
    ).toEqual({
      title: "Missed booking",
      titleAr: MISSED_BOOKING_TITLE_AR,
      message: "Arena 1 - SQUASH 6 on 2026-04-01 was marked as missed.",
      messageAr: MISSED_BOOKING_MESSAGE_AR,
    });
  });

  it("formats booking messages with readable dates and 12-hour time", () => {
    expect(
      normalizeNotificationCopy({
        category: "booking",
        eventKey: "booking_created",
        title: "New booking received",
        titleAr: "تم استلام حجز جديد",
        message: "Abdelrahman Sotohy booked Z ONE PADEL on 2026-04-10 from 19:00 to 20:00.",
        messageAr: "قام Abdelrahman Sotohy بحجز Z ONE PADEL بتاريخ 2026-04-10 من 19:00 إلى 20:00.",
        metadata: {
          date: "2026-04-10",
          startTime: "19:00",
          endTime: "20:00",
        },
      }),
    ).toEqual({
      title: "New booking received",
      titleAr: "تم استلام حجز جديد",
      message: "Abdelrahman Sotohy booked Z ONE PADEL for April 10, 2026 from 7:00 PM to 8:00 PM.",
      messageAr: "قام Abdelrahman Sotohy بحجز Z ONE PADEL بتاريخ ١٠ أبريل ٢٠٢٦ من ٧:٠٠ م إلى ٨:٠٠ م.",
    });
  });

  it("formats tournament schedule messages with a readable match slot", () => {
    expect(
      normalizeNotificationCopy({
        category: "tournament",
        eventKey: "tournament_match_scheduled",
        title: "Match scheduled",
        titleAr: "تمت جدولة المباراة",
        message: "Falcons vs Sharks in Summer Cup is set for 2026-04-10T19:00:00.000Z on Center Court.",
        messageAr: "تم تحديد مباراة Falcons ضد Sharks في كأس الصيف بتاريخ 2026-04-10T19:00:00.000Z على الملعب الرئيسي.",
        metadata: {
          startAt: "2026-04-10T19:00:00.000Z",
          endAt: "2026-04-10T20:00:00.000Z",
        },
      }),
    ).toEqual({
      title: "Match scheduled",
      titleAr: "تمت جدولة المباراة",
      message: "Falcons vs Sharks in Summer Cup is scheduled for April 10, 2026 from 9:00 PM to 10:00 PM on Center Court.",
      messageAr: "تمت جدولة مباراة Falcons ضد Sharks في كأس الصيف بتاريخ ١٠ أبريل ٢٠٢٦ من ٩:٠٠ م إلى ١٠:٠٠ م على الملعب الرئيسي.",
    });
  });

  it("deletes an owned notification and returns the remaining unread count", async () => {
    jest.spyOn(prisma.notification, "findFirst").mockResolvedValue({ id: "notification-1" });
    jest.spyOn(prisma.notification, "delete").mockResolvedValue({ id: "notification-1" });
    jest.spyOn(prisma.notification, "count").mockResolvedValue(2);

    await expect(
      deleteNotificationService("notification-1", { id: "user-1" }),
    ).resolves.toEqual({
      deletedId: "notification-1",
      unreadCount: 2,
    });
  });

  it("keeps in-app deliveries enabled even if a stored preference row says otherwise", async () => {
    const tx = {
      userNotificationPreference: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: "user-1",
            inAppEnabled: false,
            webPushEnabled: false,
            criticalOnlyOnPush: true,
          },
        ]),
      },
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: "notification-1" }),
      },
      notificationDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    await expect(
      createNotificationsTx(tx, [
        {
          userId: "user-1",
          title: "Booking confirmed",
          message: "Your booking is confirmed.",
          category: "booking",
        },
      ]),
    ).resolves.toEqual({ count: 1 });

    expect(tx.notificationDelivery.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          channel: "in_app",
          status: "sent",
          provider: "mal3bk_in_app",
          errorMessage: null,
        }),
      ]),
    });
  });

  it("ignores public attempts to turn off in-app notifications in preferences", async () => {
    jest.spyOn(prisma.userNotificationPreference, "upsert").mockResolvedValue({
      userId: "user-1",
      inAppEnabled: false,
      webPushEnabled: false,
      criticalOnlyOnPush: false,
    });
    jest.spyOn(prisma.pushSubscription, "findMany").mockResolvedValue([]);

    const result = await updateNotificationPreferencesService(
      {
        inAppEnabled: false,
        criticalOnlyOnPush: false,
      },
      { id: "user-1" },
    );

    expect(prisma.userNotificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {
        inAppEnabled: true,
        criticalOnlyOnPush: false,
      },
      create: {
        userId: "user-1",
        inAppEnabled: true,
        webPushEnabled: false,
        criticalOnlyOnPush: false,
      },
    });
    expect(result.preferences).toEqual({
      inAppEnabled: true,
      webPushEnabled: false,
      criticalOnlyOnPush: false,
    });
  });

  it("clears read notifications without touching the unread counter", async () => {
    jest.spyOn(prisma.notification, "deleteMany").mockResolvedValue({ count: 3 });
    jest.spyOn(prisma.notification, "count").mockResolvedValue(1);

    await expect(
      clearReadNotificationsService({ id: "user-1" }),
    ).resolves.toEqual({
      deletedCount: 3,
      unreadCount: 1,
    });
  });
});
