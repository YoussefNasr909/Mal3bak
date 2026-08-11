import { prisma } from "../../db/prisma.js";
import { createEgyptDate, getAbsoluteBookingTimes } from "../../utils/date-utils.js";
import {
  getWebPushPublicKey,
  isWebPushConfigured,
  sendWebPushNotification,
} from "../../utils/web-push.js";

const notificationInclude = {
  actor: {
    select: {
      id: true,
      name: true,
      businessName: true,
      role: true,
    },
  },
  deliveries: {
    select: {
      channel: true,
      status: true,
      provider: true,
      errorMessage: true,
      sentAt: true,
    },
  },
};

const MISSED_BOOKING_TITLE = "Missed booking";
const MISSED_BOOKING_TITLE_AR =
  "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u062C\u0632 \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631";
const DEFAULT_MISSED_BOOKING_MESSAGE_AR =
  "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u062D\u062C\u0632 \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631.";
const ARABIC_MOJIBAKE_PATTERN = /[\u00C2\u00C3\u00D0\u00D5\u00D8\u00D9\uFFFD]/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const IMPORTANT_PRIORITIES = new Set(["high", "urgent"]);
const PUSH_CAPABLE_EVENT_KEYS = new Set([
  "booking_cancelled",
  "booking_missed",
  "tournament_match_scheduled",
  "tournament_match_updated",
  "account_updated",
]);
const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppEnabled: true,
  webPushEnabled: false,
  criticalOnlyOnPush: true,
};
const NOTIFICATION_CATEGORY_KEYS = ["booking", "tournament", "account", "system", "admin"];

function isLikelyMojibake(value) {
  return typeof value === "string" && ARABIC_MOJIBAKE_PATTERN.test(value);
}

function getNotificationStatus(notification) {
  const status = notification?.metadata?.status;
  return typeof status === "string" ? status : null;
}

function normalizeMissedBookingMessage(message) {
  if (typeof message !== "string") return "";

  return message
    .replace(
      /^(.*?) was marked as(?: a)? no-show for (.*?) on (\d{4}-\d{2}-\d{2})\.?$/i,
      "$1 missed the booking for $2 on $3.",
    )
    .replace(
      /^(.*) on (\d{4}-\d{2}-\d{2}) was marked as(?: a)? no-show\.?$/i,
      "$1 on $2 was marked as missed.",
    );
}

function buildMissedBookingArabicMessage(message) {
  if (typeof message !== "string") return null;

  const managerMatch = message.match(/^(.*?) missed the booking for (.*?) on (\d{4}-\d{2}-\d{2})\.?$/i);
  if (managerMatch) {
    const [, playerName, courtName, date] = managerMatch;
    return `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 ${playerName} \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631 \u0641\u064A ${courtName} \u0628\u062A\u0627\u0631\u064A\u062E ${date}.`;
  }

  const playerMatch = message.match(/^(.*) on (\d{4}-\d{2}-\d{2}) was marked as missed\.?$/i);
  if (playerMatch) {
    const [, courtName, date] = playerMatch;
    return `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u062D\u062C\u0632 ${courtName} \u0628\u062A\u0627\u0631\u064A\u062E ${date} \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631.`;
  }

  return null;
}

function getNotificationLocale(language) {
  return language === "ar" ? "ar-EG" : "en-US";
}

function cleanNotificationText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function getMetadataText(notification, key) {
  const value = notification?.metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseIsoDateParts(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function parseTimeParts(value) {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { hour, minute };
}

function formatNotificationDate(dateValue, language) {
  const parts = parseIsoDateParts(dateValue);
  if (!parts) return null;

  const date = createEgyptDate(parts.year, parts.month, parts.day, 12, 0);
  return new Intl.DateTimeFormat(getNotificationLocale(language), {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatNotificationTime(dateValue, timeValue, language) {
  const dateParts = parseIsoDateParts(dateValue) || { year: 2026, month: 1, day: 1 };
  const timeParts = parseTimeParts(timeValue);
  if (!timeParts) return null;

  const date = createEgyptDate(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
  );

  return new Intl.DateTimeFormat(getNotificationLocale(language), {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatBookingSlot(dateValue, startTime, endTime, language) {
  const formattedDate = formatNotificationDate(dateValue, language);
  if (!formattedDate) return null;

  const formattedStart = formatNotificationTime(dateValue, startTime, language);
  const formattedEnd = formatNotificationTime(dateValue, endTime, language);

  if (formattedStart && formattedEnd) {
    return language === "ar"
      ? `${formattedDate} من ${formattedStart} إلى ${formattedEnd}`
      : `${formattedDate} from ${formattedStart} to ${formattedEnd}`;
  }

  return formattedDate;
}

function getAbsoluteDateParts(value, language) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type) => Number.parseInt(parts.find((part) => part.type === type)?.value || "", 10);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function isSameCairoDay(startValue, endValue, language) {
  const start = getAbsoluteDateParts(startValue, language);
  const end = getAbsoluteDateParts(endValue, language);
  if (!start || !end) return false;
  return start.year === end.year && start.month === end.month && start.day === end.day;
}

function formatAbsoluteNotificationSlot(startValue, endValue, language) {
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  if (!Number.isFinite(start.getTime())) return null;

  const locale = getNotificationLocale(language);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const formattedStartDate = dateFormatter.format(start);
  const formattedStartTime = timeFormatter.format(start);

  if (!endValue) {
    return language === "ar"
      ? `${formattedStartDate} الساعة ${formattedStartTime}`
      : `${formattedStartDate} at ${formattedStartTime}`;
  }

  const end = endValue instanceof Date ? endValue : new Date(endValue);
  if (!Number.isFinite(end.getTime())) {
    return language === "ar"
      ? `${formattedStartDate} الساعة ${formattedStartTime}`
      : `${formattedStartDate} at ${formattedStartTime}`;
  }

  const formattedEndDate = dateFormatter.format(end);
  const formattedEndTime = timeFormatter.format(end);

  if (isSameCairoDay(start, end, language)) {
    return language === "ar"
      ? `${formattedStartDate} من ${formattedStartTime} إلى ${formattedEndTime}`
      : `${formattedStartDate} from ${formattedStartTime} to ${formattedEndTime}`;
  }

  return language === "ar"
    ? `${formattedStartDate} الساعة ${formattedStartTime} حتى ${formattedEndDate} الساعة ${formattedEndTime}`
    : `${formattedStartDate} at ${formattedStartTime} until ${formattedEndDate} at ${formattedEndTime}`;
}

function extractFirstMatchGroups(value, patterns) {
  const text = cleanNotificationText(value);
  if (!text) return null;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match.slice(1).map((part) => cleanNotificationText(part));
    }
  }

  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanNotificationText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function extractBookingCourtName(message) {
  const groups = extractFirstMatchGroups(message, [
    /^(.*?) on \d{4}-\d{2}-\d{2} from \d{2}:\d{2} to \d{2}:\d{2} is confirmed\.?$/i,
    /^(.*?) was booked for you on \d{4}-\d{2}-\d{2} from \d{2}:\d{2} to \d{2}:\d{2}\.?$/i,
    /^(.*?) was moved from \d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2} to \d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}\.?$/i,
    /^(.*?) on \d{4}-\d{2}-\d{2} from \d{2}:\d{2} to \d{2}:\d{2} was cancelled\.?$/i,
    /^(.*?) on \d{4}-\d{2}-\d{2} from \d{2}:\d{2} to \d{2}:\d{2} was archived by an administrator\.?$/i,
    /^(.*?) on \d{4}-\d{2}-\d{2} has been marked as completed\.?$/i,
    /^(.*?) on \d{4}-\d{2}-\d{2} was marked as missed\.?$/i,
    /^(?:.*?) no longer has a booking on (.*?) for \d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}\.?$/i,
    /^(?:.*?) missed the booking for (.*?) on \d{4}-\d{2}-\d{2}\.?$/i,
  ]);

  return groups?.[0] || null;
}

function extractBookingActorAndCourt(message) {
  const groups = extractFirstMatchGroups(message, [
    /^(.*?) booked (.*?) on \d{4}-\d{2}-\d{2} from \d{2}:\d{2} to \d{2}:\d{2}\.?$/i,
    /^(.*?) was added to (.*?) on \d{4}-\d{2}-\d{2} from \d{2}:\d{2} to \d{2}:\d{2}\.?$/i,
    /^(.*?) moved their booking on (.*?) from \d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2} to \d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}\.?$/i,
    /^(.*?) no longer has a booking on (.*?) for \d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}\.?$/i,
    /^(.*?) missed the booking for (.*?) on \d{4}-\d{2}-\d{2}\.?$/i,
  ]);

  if (!groups || groups.length < 2) return null;
  return {
    actor: groups[0],
    court: groups[1],
  };
}

function extractTournamentMatchDetails(message) {
  const groups = extractFirstMatchGroups(message, [
    /^(.*?) vs (.*?) in (.*?) is set for .* on (.*?)\.?$/i,
  ]);

  if (!groups || groups.length < 4) return null;
  return {
    teamA: groups[0],
    teamB: groups[1],
    tournament: groups[2],
    court: groups[3],
  };
}

function extractTournamentMatchDetailsAr(message) {
  const groups = extractFirstMatchGroups(message, [
    /^\u062A\u0645 \u062A\u062D\u062F\u064A\u062F \u0645\u0628\u0627\u0631\u0627\u0629 (.*?) \u0636\u062F (.*?) \u0641\u064A (.*?) \u0628\u062A\u0627\u0631\u064A\u062E .* \u0639\u0644\u0649 (.*?)\.?$/i,
  ]);

  if (!groups || groups.length < 4) return null;
  return {
    teamA: groups[0],
    teamB: groups[1],
    tournament: groups[2],
    court: groups[3],
  };
}

function getBookingSlotCopy(notification, previous = false) {
  const dateKey = previous ? "previousDate" : "date";
  const startKey = previous ? "previousStartTime" : "startTime";
  const endKey = previous ? "previousEndTime" : "endTime";

  const dateValue = getMetadataText(notification, dateKey);
  const startTime = getMetadataText(notification, startKey);
  const endTime = getMetadataText(notification, endKey);

  return {
    en: formatBookingSlot(dateValue, startTime, endTime, "en"),
    ar: formatBookingSlot(dateValue, startTime, endTime, "ar"),
  };
}

function buildBookingNotificationCopy(notification, baseCopy, eventKey) {
  const title = cleanNotificationText(baseCopy.title);
  const slot = getBookingSlotCopy(notification, false);
  const participantDetails = extractBookingActorAndCourt(baseCopy.message);
  const courtName = firstNonEmpty(
    getMetadataText(notification, "courtName"),
    getMetadataText(notification, "courtNameEn"),
    getMetadataText(notification, "courtNameAr"),
    participantDetails?.court,
    extractBookingCourtName(baseCopy.message),
  );
  const courtNameAr = firstNonEmpty(getMetadataText(notification, "courtNameAr"), courtName);
  const actorName = firstNonEmpty(
    getMetadataText(notification, "playerName"),
    participantDetails?.actor,
    notification?.actor?.businessName,
    notification?.actor?.name,
  );

  if (eventKey === "booking_created") {
    if (/new booking received/i.test(title) && slot.en && slot.ar && actorName && courtName) {
      return {
        title: "New booking received",
        titleAr: "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u062D\u062C\u0632 \u062C\u062F\u064A\u062F",
        message: `${actorName} booked ${courtName} for ${slot.en}.`,
        messageAr: `\u0642\u0627\u0645 ${actorName} \u0628\u062D\u062C\u0632 ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`,
      };
    }

    if (/added for you/i.test(title) && slot.en && slot.ar) {
      return {
        title: "A booking was added for you",
        titleAr: "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u062D\u062C\u0632 \u0644\u0643",
        message: courtName
          ? `A booking was added for you at ${courtName} for ${slot.en}.`
          : `A booking was added for you for ${slot.en}.`,
        messageAr: courtNameAr
          ? `\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u062D\u062C\u0632 \u0644\u0643 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`
          : `\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u062D\u062C\u0632 \u0644\u0643 \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`,
      };
    }

    if (/manual booking created on your court/i.test(title) && slot.en && slot.ar) {
      return {
        title: "Manual booking created on your court",
        titleAr: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u062D\u062C\u0632 \u064A\u062F\u0648\u064A \u0639\u0644\u0649 \u0645\u0644\u0639\u0628\u0643",
        message: actorName && courtName
          ? `${actorName} was added to ${courtName} for ${slot.en}.`
          : baseCopy.message,
        messageAr: actorName && courtNameAr
          ? `\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 ${actorName} \u0625\u0644\u0649 ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`
          : baseCopy.messageAr,
      };
    }
  }

  if (eventKey === "booking_confirmed" && slot.en && slot.ar) {
    return {
      title: "Booking confirmed",
      titleAr: "\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u062C\u0632",
      message: courtName
        ? `Your booking at ${courtName} is confirmed for ${slot.en}.`
        : `Your booking is confirmed for ${slot.en}.`,
      messageAr: courtNameAr
        ? `\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u062D\u062C\u0632\u0643 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`
        : `\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062D\u062C\u0632 \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`,
    };
  }

  if ((eventKey === "booking_cancelled" || eventKey === "booking_archived") && slot.en && slot.ar) {
    const isArchived = eventKey === "booking_archived" || /archived/i.test(title);

    if (/on your court/i.test(title) && actorName && courtName) {
      return {
        title: isArchived ? "Booking archived on your court" : "Booking cancelled on your court",
        titleAr: isArchived
          ? "\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u062D\u062C\u0632 \u0639\u0644\u0649 \u0645\u0644\u0639\u0628\u0643"
          : "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062D\u062C\u0632 \u0639\u0644\u0649 \u0645\u0644\u0639\u0628\u0643",
        message: isArchived
          ? `${actorName}'s booking on ${courtName} for ${slot.en} was archived.`
          : `${actorName} no longer has a booking on ${courtName} for ${slot.en}.`,
        messageAr: isArchived
          ? `\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u062D\u062C\u0632 ${actorName} \u0639\u0644\u0649 ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`
          : `\u0644\u0645 \u064A\u0639\u062F \u0644\u062F\u0649 ${actorName} \u062D\u062C\u0632 \u0639\u0644\u0649 ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`,
      };
    }

    return {
      title: isArchived ? "Booking archived" : "Booking cancelled",
      titleAr: isArchived
        ? "\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u062D\u062C\u0632"
        : "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062D\u062C\u0632",
      message: courtName
        ? isArchived
          ? `Your booking at ${courtName} for ${slot.en} was archived by the admin.`
          : `Your booking at ${courtName} for ${slot.en} was cancelled.`
        : isArchived
          ? `Your booking for ${slot.en} was archived by the admin.`
          : `Your booking for ${slot.en} was cancelled.`,
      messageAr: courtNameAr
        ? isArchived
          ? `\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u062D\u062C\u0632\u0643 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar} \u0628\u0648\u0627\u0633\u0637\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.`
          : `\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062D\u062C\u0632\u0643 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`
        : isArchived
          ? `\u062A\u0645\u062A \u0623\u0631\u0634\u0641\u0629 \u062D\u062C\u0632\u0643 \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar} \u0628\u0648\u0627\u0633\u0637\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.`
          : `\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062D\u062C\u0632\u0643 \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`,
    };
  }

  if (eventKey === "booking_completed" && slot.en && slot.ar) {
    return {
      title: "Booking completed",
      titleAr: "\u0627\u0643\u062A\u0645\u0644 \u0627\u0644\u062D\u062C\u0632",
      message: courtName
        ? `Your booking at ${courtName} for ${slot.en} was marked as completed.`
        : `Your booking for ${slot.en} was marked as completed.`,
      messageAr: courtNameAr
        ? `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u062D\u062C\u0632\u0643 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar} \u0643\u0645\u0643\u062A\u0645\u0644.`
        : `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u062C\u0632 \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar} \u0643\u0645\u0643\u062A\u0645\u0644.`,
    };
  }

  if (eventKey === "booking_missed") {
    if (actorName && courtName && slot.en && slot.ar && /missed the booking/i.test(baseCopy.message)) {
      return {
        title: MISSED_BOOKING_TITLE,
        titleAr: MISSED_BOOKING_TITLE_AR,
        message: `${actorName} missed the booking for ${courtName} scheduled for ${slot.en}.`,
        messageAr: `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 ${actorName} \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar}.`,
      };
    }

    if (slot.en && slot.ar) {
      return {
        title: MISSED_BOOKING_TITLE,
        titleAr: MISSED_BOOKING_TITLE_AR,
        message: courtName
          ? `Your booking at ${courtName} for ${slot.en} was marked as missed.`
          : `Your booking for ${slot.en} was marked as missed.`,
        messageAr: courtNameAr
          ? `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u062D\u062C\u0632\u0643 \u0641\u064A ${courtNameAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar} \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631.`
          : `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u062C\u0632 \u0628\u062A\u0627\u0631\u064A\u062E ${slot.ar} \u0643\u0639\u062F\u0645 \u062D\u0636\u0648\u0631.`,
      };
    }
  }

  return null;
}

function buildTournamentNotificationCopy(notification, baseCopy, eventKey) {
  if (eventKey !== "tournament_match_scheduled" && eventKey !== "tournament_match_updated") {
    return null;
  }

  const slotEn = formatAbsoluteNotificationSlot(
    getMetadataText(notification, "startAt"),
    getMetadataText(notification, "endAt"),
    "en",
  );
  const slotAr = formatAbsoluteNotificationSlot(
    getMetadataText(notification, "startAt"),
    getMetadataText(notification, "endAt"),
    "ar",
  );
  const detailsEn = extractTournamentMatchDetails(baseCopy.message);
  const detailsAr = extractTournamentMatchDetailsAr(baseCopy.messageAr);

  if (!slotEn || !slotAr || !detailsEn) {
    return null;
  }

  const teamAEn = detailsEn.teamA;
  const teamBEn = detailsEn.teamB;
  const tournamentEn = detailsEn.tournament;
  const courtEn = detailsEn.court;
  const teamAAr = firstNonEmpty(detailsAr?.teamA, teamAEn);
  const teamBAr = firstNonEmpty(detailsAr?.teamB, teamBEn);
  const tournamentAr = firstNonEmpty(detailsAr?.tournament, tournamentEn);
  const courtAr = firstNonEmpty(detailsAr?.court, courtEn);
  const isRescheduled = eventKey === "tournament_match_updated";

  return {
    title: isRescheduled ? "Match rescheduled" : "Match scheduled",
    titleAr: isRescheduled
      ? "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u062C\u062F\u0648\u0644\u0629 \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629"
      : "\u062A\u0645\u062A \u062C\u062F\u0648\u0644\u0629 \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629",
    message: isRescheduled
      ? `${teamAEn} vs ${teamBEn} in ${tournamentEn} was rescheduled to ${slotEn} on ${courtEn}.`
      : `${teamAEn} vs ${teamBEn} in ${tournamentEn} is scheduled for ${slotEn} on ${courtEn}.`,
    messageAr: isRescheduled
      ? `\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u062C\u062F\u0648\u0644\u0629 \u0645\u0628\u0627\u0631\u0627\u0629 ${teamAAr} \u0636\u062F ${teamBAr} \u0641\u064A ${tournamentAr} \u0625\u0644\u0649 ${slotAr} \u0639\u0644\u0649 ${courtAr}.`
      : `\u062A\u0645\u062A \u062C\u062F\u0648\u0644\u0629 \u0645\u0628\u0627\u0631\u0627\u0629 ${teamAAr} \u0636\u062F ${teamBAr} \u0641\u064A ${tournamentAr} \u0628\u062A\u0627\u0631\u064A\u062E ${slotAr} \u0639\u0644\u0649 ${courtAr}.`,
  };
}

function buildEnhancedNotificationCopy(notification, baseCopy) {
  const eventKey = normalizeEventKey(notification?.eventKey) || deriveNotificationEventKey(notification);

  if (eventKey.startsWith("booking_")) {
    return buildBookingNotificationCopy(notification, baseCopy, eventKey);
  }

  if (eventKey.startsWith("tournament_match_")) {
    return buildTournamentNotificationCopy(notification, baseCopy, eventKey);
  }

  return null;
}

function isMissedBookingNotification(notification, title, message, titleAr, messageAr) {
  return (
    notification?.category === "booking" &&
    (
      getNotificationStatus(notification) === "no_show" ||
      /no-show/i.test(title) ||
      /no-show/i.test(message) ||
      isLikelyMojibake(titleAr) ||
      isLikelyMojibake(messageAr)
    )
  );
}

export function normalizeNotificationCopy(notification) {
  const title = typeof notification?.title === "string" ? notification.title : "";
  const titleAr = typeof notification?.titleAr === "string" ? notification.titleAr : null;
  const message = typeof notification?.message === "string" ? notification.message : "";
  const messageAr = typeof notification?.messageAr === "string" ? notification.messageAr : null;

  const baseCopy = !isMissedBookingNotification(notification, title, message, titleAr, messageAr)
    ? {
        title,
        titleAr,
        message,
        messageAr,
      }
    : {
        title: MISSED_BOOKING_TITLE,
        titleAr: MISSED_BOOKING_TITLE_AR,
        message: normalizeMissedBookingMessage(message),
        messageAr:
          buildMissedBookingArabicMessage(normalizeMissedBookingMessage(message)) ||
          (messageAr && !isLikelyMojibake(messageAr) ? messageAr : DEFAULT_MISSED_BOOKING_MESSAGE_AR),
      };

  return buildEnhancedNotificationCopy(notification, baseCopy) || baseCopy;
}

function lowerText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeEventKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || null;
}

function normalizePriority(value) {
  const normalized = lowerText(value);
  return VALID_PRIORITIES.has(normalized) ? normalized : null;
}

function parseCairoDateTimeToMs(date, time) {
  if (typeof date !== "string" || typeof time !== "string") return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  return createEgyptDate(year, month, day, hour, minute).getTime();
}

function parseAbsoluteDateMs(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isWithinNext24Hours(startMs) {
  if (!Number.isFinite(startMs)) return false;
  const delta = startMs - Date.now();
  return delta >= 0 && delta <= TWENTY_FOUR_HOURS_MS;
}

function deriveNotificationEventKey(notification) {
  const category = lowerText(notification?.category);
  const title = lowerText(notification?.title);
  const message = lowerText(notification?.message);
  const combined = `${title} ${message}`;
  const status = lowerText(getNotificationStatus(notification));

  if (category === "booking") {
    if (status === "no_show" || combined.includes("missed booking") || combined.includes("no-show")) {
      return "booking_missed";
    }
    if (combined.includes("cancelled")) return "booking_cancelled";
    if (combined.includes("archived")) return "booking_archived";
    if (combined.includes("confirmed")) return "booking_confirmed";
    if (
      combined.includes("new booking received") ||
      combined.includes("manual booking created") ||
      combined.includes("booking was added for you")
    ) {
      return "booking_created";
    }
    if (combined.includes("completed")) return "booking_completed";
    return "booking_updated";
  }

  if (category === "tournament") {
    if (combined.includes("registration submitted")) return "tournament_registration_submitted";
    if (combined.includes("registration rejected")) return "tournament_registration_rejected";
    if (combined.includes("approved")) return "tournament_registration_approved";
    if (combined.includes("registration closed")) return "tournament_registration_closed";
    if (combined.includes("match rescheduled")) return "tournament_match_updated";
    if (combined.includes("match scheduled")) return "tournament_match_scheduled";
    if (combined.includes("bracket is ready")) return "tournament_bracket_generated";
    if (combined.includes("waitlist") && combined.includes("promoted")) return "tournament_waitlist_promoted";
    if (combined.includes("waitlist")) return "tournament_waitlist_updated";
    if (combined.includes("completed")) return "tournament_completed";
    if (combined.includes("cancelled")) return "tournament_cancelled";
    if (combined.includes("in progress")) return "tournament_in_progress";
    return "tournament_update";
  }

  if (category === "account") {
    if (combined.includes("account created")) return "account_created";
    if (combined.includes("password")) return "account_security_updated";
    return "account_updated";
  }

  if (category === "admin") {
    if (combined.includes("account created")) return "account_created";
    if (
      combined.includes("role updated") ||
      combined.includes("account activated") ||
      combined.includes("account deactivated") ||
      combined.includes("account details updated")
    ) {
      return "account_updated";
    }
    if (combined.includes("password")) return "account_security_updated";
    return "admin_update";
  }

  return "system_announcement";
}

function isMajorAccountUpdate(notification) {
  const title = lowerText(notification?.title);
  return (
    title.includes("role updated") ||
    title.includes("deactivated") ||
    title.includes("password updated by admin")
  );
}

function getNotificationStartMs(notification, eventKey) {
  const metadata = notification?.metadata ?? {};

  if (String(eventKey || "").startsWith("booking_")) {
    if (metadata.sessionOpenTime && metadata.endTime) {
      const useOpeningDay = metadata.useOpeningDayForOvernightBookings === true;
      return getAbsoluteBookingTimes(
        metadata.date,
        metadata.startTime,
        metadata.endTime,
        metadata.sessionOpenTime,
        useOpeningDay,
      ).startMs;
    }
    return parseCairoDateTimeToMs(metadata.date, metadata.startTime);
  }

  if (eventKey === "tournament_match_scheduled" || eventKey === "tournament_match_updated") {
    return parseAbsoluteDateMs(metadata.startAt);
  }

  return null;
}

function deriveNotificationPriority(notification, eventKey) {
  const startMs = getNotificationStartMs(notification, eventKey);

  if (eventKey === "booking_cancelled") {
    return isWithinNext24Hours(startMs) ? "urgent" : "normal";
  }

  if (eventKey === "tournament_match_scheduled" || eventKey === "tournament_match_updated") {
    return isWithinNext24Hours(startMs) ? "high" : "normal";
  }

  if (eventKey === "booking_missed" || eventKey === "tournament_registration_rejected") {
    return "high";
  }

  if (eventKey === "account_updated") {
    return isMajorAccountUpdate(notification) ? "high" : "normal";
  }

  if (eventKey === "account_security_updated") {
    return "high";
  }

  return "normal";
}

function buildDeliverySummary(deliveries = []) {
  if (!Array.isArray(deliveries) || deliveries.length === 0) return null;

  return deliveries.reduce((summary, delivery) => {
    summary[delivery.channel] = {
      status: delivery.status,
      provider: delivery.provider || null,
      errorMessage: delivery.errorMessage || null,
      sentAt: delivery.sentAt ? delivery.sentAt.toISOString() : null,
    };
    return summary;
  }, {});
}

function serializeNotification(notification) {
  if (!notification) return notification;
  const normalizedCopy = normalizeNotificationCopy(notification);

  return {
    id: notification.id,
    userId: notification.userId,
    actorUserId: notification.actorUserId || null,
    actorName: notification.actor?.businessName || notification.actor?.name || null,
    actorRole: notification.actor?.role || null,
    type: notification.type,
    category: notification.category,
    priority: notification.priority,
    eventKey: notification.eventKey,
    title: normalizedCopy.title,
    titleAr: normalizedCopy.titleAr,
    message: normalizedCopy.message,
    messageAr: normalizedCopy.messageAr,
    link: notification.link || null,
    metadata: notification.metadata || null,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
    deliverySummary: buildDeliverySummary(notification.deliveries),
  };
}

function normalizeNotificationInput(input = {}) {
  const notification = {
    userId: input.userId,
    actorUserId: input.actorUserId || null,
    type: input.type || "info",
    category: input.category || "system",
    title: String(input.title || "").trim(),
    titleAr: input.titleAr ? String(input.titleAr).trim() : null,
    message: String(input.message || "").trim(),
    messageAr: input.messageAr ? String(input.messageAr).trim() : null,
    link: input.link ? String(input.link).trim() : null,
    metadata: input.metadata ?? undefined,
  };

  const eventKey = normalizeEventKey(input.eventKey) || deriveNotificationEventKey(notification);
  const priority = normalizePriority(input.priority) || deriveNotificationPriority(notification, eventKey);

  return {
    ...notification,
    eventKey,
    priority,
  };
}

function buildDedupedNotificationBatch(inputs = []) {
  const seen = new Set();
  const normalized = [];

  for (const input of inputs) {
    const item = normalizeNotificationInput(input);
    if (!item.userId || !item.title || !item.message) continue;

    const dedupeKey = [
      item.userId,
      item.actorUserId || "",
      item.category,
      item.type,
      item.priority,
      item.eventKey,
      item.title,
      item.message,
      item.link || "",
    ].join("::");

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(item);
  }

  return normalized;
}

function createDefaultPreferenceRecord(userId) {
  return normalizeNotificationPreference({
    userId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
}

function normalizeNotificationPreference(preference = {}) {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...preference,
    inAppEnabled: true,
  };
}

async function getPreferenceMap(tx, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const rows =
    typeof tx.userNotificationPreference?.findMany === "function"
      ? await tx.userNotificationPreference.findMany({
          where: {
            userId: { in: userIds },
          },
        })
      : [];

  const map = new Map(userIds.map((userId) => [userId, createDefaultPreferenceRecord(userId)]));
  for (const row of rows) {
    map.set(row.userId, normalizeNotificationPreference(row));
  }
  return map;
}

async function getPushSubscriptionMap(tx, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const rows =
    typeof tx.pushSubscription?.findMany === "function"
      ? await tx.pushSubscription.findMany({
          where: {
            userId: { in: userIds },
          },
          orderBy: [
            { lastSeenAt: "desc" },
            { createdAt: "desc" },
          ],
        })
      : [];

  const map = new Map();
  for (const userId of userIds) {
    map.set(userId, []);
  }
  for (const row of rows) {
    const list = map.get(row.userId) || [];
    list.push(row);
    map.set(row.userId, list);
  }

  return map;
}

function getPushEligibility(notification, preferences, subscriptions) {
  if (!isWebPushConfigured()) {
    return { eligible: false, reason: "Web push is not configured" };
  }

  if (!preferences?.webPushEnabled) {
    return { eligible: false, reason: "User disabled web push alerts" };
  }

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return { eligible: false, reason: "No active push subscriptions" };
  }

  if (!PUSH_CAPABLE_EVENT_KEYS.has(notification.eventKey)) {
    return { eligible: false, reason: "This notification type does not use push alerts" };
  }

  if (preferences.criticalOnlyOnPush && !IMPORTANT_PRIORITIES.has(notification.priority)) {
    return { eligible: false, reason: "Only high-priority push alerts are enabled" };
  }

  if (!preferences.criticalOnlyOnPush && notification.priority === "low") {
    return { eligible: false, reason: "Low-priority notifications are not sent to push" };
  }

  return { eligible: true };
}

function getPushFailureMessage(error) {
  if (!error) return "Push delivery failed";
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error.body === "string" && error.body.trim()) {
    return error.body.trim();
  }
  return "Push delivery failed";
}

function buildPushPayload(notification) {
  const copy = normalizeNotificationCopy(notification);

  return {
    notificationId: notification.id,
    eventKey: notification.eventKey,
    category: notification.category,
    priority: notification.priority,
    title: copy.title,
    titleAr: copy.titleAr,
    body: copy.message,
    bodyAr: copy.messageAr,
    url: notification.link || "/dashboard/notifications",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: `mal3bk:${notification.eventKey}:${notification.id}`,
  };
}

async function deliverWebPush(tx, notification, preferences, subscriptions) {
  const eligibility = getPushEligibility(notification, preferences, subscriptions);
  if (!eligibility.eligible) {
    return {
      channel: "web_push",
      status: "skipped",
      provider: "standard_web_push",
      errorMessage: eligibility.reason,
      sentAt: null,
    };
  }

  const staleSubscriptionIds = [];
  const errors = [];
  let hasSuccess = false;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendWebPushNotification(subscription, buildPushPayload(notification));
        hasSuccess = true;
      } catch (error) {
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          staleSubscriptionIds.push(subscription.id);
        }
        errors.push(getPushFailureMessage(error));
      }
    }),
  );

  if (staleSubscriptionIds.length > 0 && typeof tx.pushSubscription?.deleteMany === "function") {
    await tx.pushSubscription.deleteMany({
      where: {
        id: { in: staleSubscriptionIds },
      },
    });
  }

  if (hasSuccess) {
    return {
      channel: "web_push",
      status: "sent",
      provider: "standard_web_push",
      errorMessage: null,
      sentAt: new Date(),
    };
  }

  return {
    channel: "web_push",
    status: "failed",
    provider: "standard_web_push",
    errorMessage: [...new Set(errors)].join("; ") || "Push delivery failed",
    sentAt: null,
  };
}

async function createNotificationRecord(tx, input, preferences, subscriptions) {
  const notification = await tx.notification.create({
    data: {
      userId: input.userId,
      actorUserId: input.actorUserId,
      type: input.type,
      category: input.category,
      priority: input.priority,
      eventKey: input.eventKey,
      title: input.title,
      titleAr: input.titleAr,
      message: input.message,
      messageAr: input.messageAr,
      link: input.link,
      metadata: input.metadata,
    },
  });

  const deliveries = [
    {
      notificationId: notification.id,
      channel: "in_app",
      status: "sent",
      provider: "mal3bk_in_app",
      errorMessage: null,
      sentAt: new Date(),
    },
  ];

  deliveries.push({
    notificationId: notification.id,
    ...(await deliverWebPush(
      tx,
      {
        ...notification,
        category: input.category,
        priority: input.priority,
        eventKey: input.eventKey,
        title: input.title,
        titleAr: input.titleAr,
        message: input.message,
        messageAr: input.messageAr,
        link: input.link,
        metadata: input.metadata ?? null,
      },
      preferences,
      subscriptions,
    )),
  });

  if (typeof tx.notificationDelivery?.createMany === "function") {
    await tx.notificationDelivery.createMany({
      data: deliveries,
    });
  }

  return notification;
}

async function createNotificationsLegacyBatch(tx, data) {
  if (typeof tx.notification?.createMany !== "function") {
    return { count: 0 };
  }

  try {
    return await tx.notification.createMany({
      data,
    });
  } catch (error) {
    console.error("[notifications] Failed to create notification batch:", error);
    return { count: 0 };
  }
}

export async function createNotificationsTx(tx, inputs = []) {
  const data = buildDedupedNotificationBatch(inputs);
  if (!data.length) return { count: 0 };

  if (typeof tx.notification?.create !== "function") {
    return createNotificationsLegacyBatch(tx, data);
  }

  try {
    const userIds = [...new Set(data.map((item) => item.userId))];
    const [preferenceMap, subscriptionMap] = await Promise.all([
      getPreferenceMap(tx, userIds),
      getPushSubscriptionMap(tx, userIds),
    ]);

    let count = 0;
    for (const item of data) {
      await createNotificationRecord(
        tx,
        item,
        preferenceMap.get(item.userId) || createDefaultPreferenceRecord(item.userId),
        subscriptionMap.get(item.userId) || [],
      );
      count += 1;
    }

    return { count };
  } catch (error) {
    console.error("[notifications] Failed to create notification batch:", error);
    return { count: 0 };
  }
}

export async function createNotificationTx(tx, input) {
  return createNotificationsTx(tx, [input]);
}

function buildPriorityWhere(priority) {
  const normalized = lowerText(priority);
  if (!normalized) return {};
  if (normalized === "important") {
    return {
      priority: {
        in: ["high", "urgent"],
      },
    };
  }
  if (!VALID_PRIORITIES.has(normalized)) return {};
  return { priority: normalized };
}

function buildNotificationSummary(byCategoryRows, unreadCount, urgentUnreadCount) {
  const byCategory = NOTIFICATION_CATEGORY_KEYS.reduce((summary, category) => {
    summary[category] = 0;
    return summary;
  }, {});

  for (const row of byCategoryRows) {
    byCategory[row.category] = Number(row._count?._all || 0);
  }

  return {
    unreadCount,
    urgentUnreadCount,
    byCategory,
  };
}

export async function listNotificationsService(query, currentUser) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query?.limit, 10) || 10));
  const unreadOnly = query?.unreadOnly === true || query?.unreadOnly === "true";
  const category = query?.category ? String(query.category) : undefined;
  const skip = (page - 1) * limit;
  const priorityWhere = buildPriorityWhere(query?.priority);

  const where = {
    userId: currentUser.id,
    ...(unreadOnly ? { readAt: null } : {}),
    ...(category ? { category } : {}),
    ...priorityWhere,
  };

  const unreadWhere = {
    userId: currentUser.id,
    readAt: null,
  };

  const [items, total, unreadCount, urgentUnreadCount, byCategoryRows] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: notificationInclude,
      orderBy: [
        { priority: "desc" },
        { readAt: { sort: "asc", nulls: "first" } },
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: unreadWhere }),
    prisma.notification.count({
      where: {
        ...unreadWhere,
        priority: "urgent",
      },
    }),
    prisma.notification.groupBy({
      by: ["category"],
      where: unreadWhere,
      _count: {
        _all: true,
      },
    }),
  ]);

  return {
    items: items.map(serializeNotification),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    unreadCount,
    summary: buildNotificationSummary(byCategoryRows, unreadCount, urgentUnreadCount),
  };
}

async function getSerializedNotificationById(notificationId, userId) {
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
    include: notificationInclude,
  });

  if (!notification) {
    const err = new Error("Notification not found");
    err.statusCode = 404;
    throw err;
  }

  return notification;
}

export async function markNotificationReadService(notificationId, currentUser) {
  const existing = await getSerializedNotificationById(notificationId, currentUser.id);

  const notification =
    existing.readAt
      ? existing
      : await prisma.notification.update({
          where: { id: existing.id },
          data: { readAt: new Date() },
          include: notificationInclude,
        });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: currentUser.id,
      readAt: null,
    },
  });

  return {
    notification: serializeNotification(notification),
    unreadCount,
  };
}

export async function markAllNotificationsReadService(currentUser) {
  const result = await prisma.notification.updateMany({
    where: {
      userId: currentUser.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: currentUser.id,
      readAt: null,
    },
  });

  return {
    updatedCount: result.count,
    unreadCount,
  };
}

export async function deleteNotificationService(notificationId, currentUser) {
  const existing = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId: currentUser.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    const err = new Error("Notification not found");
    err.statusCode = 404;
    throw err;
  }

  await prisma.notification.delete({
    where: { id: existing.id },
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: currentUser.id,
      readAt: null,
    },
  });

  return {
    deletedId: existing.id,
    unreadCount,
  };
}

export async function clearReadNotificationsService(currentUser) {
  const result = await prisma.notification.deleteMany({
    where: {
      userId: currentUser.id,
      readAt: {
        not: null,
      },
    },
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: currentUser.id,
      readAt: null,
    },
  });

  return {
    deletedCount: result.count,
    unreadCount,
  };
}

function serializeNotificationPreference(preference) {
  const normalizedPreference = normalizeNotificationPreference(preference);
  return {
    inAppEnabled: normalizedPreference.inAppEnabled,
    webPushEnabled: normalizedPreference.webPushEnabled,
    criticalOnlyOnPush: normalizedPreference.criticalOnlyOnPush,
  };
}

function serializePushSubscription(subscription) {
  return {
    id: subscription.id,
    endpoint: subscription.endpoint,
    userAgent: subscription.userAgent || null,
    lastSeenAt: subscription.lastSeenAt ? subscription.lastSeenAt.toISOString() : null,
    createdAt: subscription.createdAt ? subscription.createdAt.toISOString() : null,
    updatedAt: subscription.updatedAt ? subscription.updatedAt.toISOString() : null,
  };
}

async function ensureNotificationPreference(userId) {
  return prisma.userNotificationPreference.upsert({
    where: { userId },
    update: {
      inAppEnabled: true,
    },
    create: {
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    },
  });
}

export async function getNotificationPreferencesService(currentUser) {
  const [preference, subscriptions] = await Promise.all([
    ensureNotificationPreference(currentUser.id),
    prisma.pushSubscription.findMany({
      where: {
        userId: currentUser.id,
      },
      orderBy: [
        { lastSeenAt: "desc" },
        { createdAt: "desc" },
      ],
    }),
  ]);

  return {
    preferences: serializeNotificationPreference(preference),
    push: {
      configured: isWebPushConfigured(),
      vapidPublicKey: getWebPushPublicKey(),
      subscriptionCount: subscriptions.length,
      subscriptions: subscriptions.map(serializePushSubscription),
    },
  };
}

export async function updateNotificationPreferencesService(payload, currentUser) {
  if (payload?.webPushEnabled === true && !isWebPushConfigured()) {
    const err = new Error("Web push is not configured on the server");
    err.statusCode = 400;
    throw err;
  }

  const updates = {
    inAppEnabled: true,
  };
  if (typeof payload?.webPushEnabled === "boolean") {
    updates.webPushEnabled = payload.webPushEnabled;
  }
  if (typeof payload?.criticalOnlyOnPush === "boolean") {
    updates.criticalOnlyOnPush = payload.criticalOnlyOnPush;
  }

  const preference = await prisma.userNotificationPreference.upsert({
    where: { userId: currentUser.id },
    update: updates,
    create: {
      userId: currentUser.id,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...updates,
    },
  });

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId: currentUser.id,
    },
    orderBy: [
      { lastSeenAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  return {
    preferences: serializeNotificationPreference(preference),
    push: {
      configured: isWebPushConfigured(),
      vapidPublicKey: getWebPushPublicKey(),
      subscriptionCount: subscriptions.length,
      subscriptions: subscriptions.map(serializePushSubscription),
    },
  };
}

export async function createPushSubscriptionService(payload, currentUser) {
  if (!isWebPushConfigured()) {
    const err = new Error("Web push is not configured on the server");
    err.statusCode = 400;
    throw err;
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: {
      endpoint: payload.endpoint,
    },
    update: {
      userId: currentUser.id,
      p256dhKey: payload.p256dhKey,
      authKey: payload.authKey,
      userAgent: payload.userAgent || null,
      lastSeenAt: new Date(),
    },
    create: {
      userId: currentUser.id,
      endpoint: payload.endpoint,
      p256dhKey: payload.p256dhKey,
      authKey: payload.authKey,
      userAgent: payload.userAgent || null,
      lastSeenAt: new Date(),
    },
  });

  return {
    subscription: serializePushSubscription(subscription),
  };
}

export async function deletePushSubscriptionService(payload, currentUser) {
  const result = await prisma.pushSubscription.deleteMany({
    where: {
      userId: currentUser.id,
      endpoint: payload.endpoint,
    },
  });

  return {
    deletedCount: result.count,
  };
}
