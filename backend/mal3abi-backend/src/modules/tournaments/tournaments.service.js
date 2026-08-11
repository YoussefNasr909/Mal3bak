import { prisma } from "../../db/prisma.js";
import { getAbsoluteBookingTimes, getAbsoluteSessionTimes, timeToMinutes } from "../../utils/date-utils.js";
import { normalizePhone } from "../../utils/phone.js";
import { createNotificationsTx } from "../notifications/notifications.service.js";

const publicTournamentStatuses = new Set([
  "published",
  "registration_open",
  "registration_closed",
  "in_progress",
  "completed",
  "cancelled",
]);
const TOURNAMENT_REGISTRATION_SYNC_INTERVAL_MS = Math.max(
  0,
  Number.parseInt(process.env.TOURNAMENT_REGISTRATION_SYNC_INTERVAL_MS || "15000", 10) || 15000,
);
let closeExpiredTournamentRegistrationsPromise = null;
let lastTournamentRegistrationSyncAt = 0;

function assertManagerOrAdmin(user) {
  if (!user || !["admin", "manager"].includes(user.role)) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
}

function assertTournamentAccess(tournament, user) {
  if (!tournament) {
    const err = new Error("Tournament not found");
    err.statusCode = 404;
    throw err;
  }

  if (user.role === "admin") return;
  if (user.role === "manager") {
    if (tournament.managerId !== user.id) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    return;
  }

  if (user.role === "player") {
    if (!publicTournamentStatuses.has(tournament.status)) {
      const err = new Error("Tournament not found");
      err.statusCode = 404;
      throw err;
    }
  }
}

function assertPublicTournamentVisible(tournament) {
  if (!tournament || !publicTournamentStatuses.has(tournament.status)) {
    const err = new Error("Tournament not found");
    err.statusCode = 404;
    throw err;
  }
}

function formatDateValue(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function formatDateOnlyCairo(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function assertTournamentTimelineWindow(timeline) {
  const registrationOpenAtMs = toMs(timeline.registrationOpenAt);
  const registrationCloseAtMs = toMs(timeline.registrationCloseAt);
  const startDateMs = toMs(timeline.startDate);
  const endDateMs = toMs(timeline.endDate);

  if (registrationOpenAtMs != null && registrationCloseAtMs != null && registrationCloseAtMs < registrationOpenAtMs) {
    const err = new Error("registrationCloseAt must be after registrationOpenAt");
    err.statusCode = 400;
    throw err;
  }
  if (startDateMs != null && endDateMs != null && endDateMs < startDateMs) {
    const err = new Error("endDate must be after startDate");
    err.statusCode = 400;
    throw err;
  }
  if (registrationOpenAtMs != null && startDateMs != null && registrationOpenAtMs > startDateMs) {
    const err = new Error("registrationOpenAt cannot be after the tournament start date");
    err.statusCode = 400;
    throw err;
  }
  if (registrationCloseAtMs != null && startDateMs != null && registrationCloseAtMs > startDateMs) {
    const err = new Error("registrationCloseAt cannot be after the tournament start date");
    err.statusCode = 400;
    throw err;
  }
}

function isRegistrationClosedByTime(tournament) {
  const registrationCloseAtMs = toMs(tournament?.registrationCloseAt);
  return registrationCloseAtMs != null && registrationCloseAtMs < Date.now();
}

function hasTournamentStarted(tournament) {
  const startDateMs = toMs(tournament?.startDate);
  return startDateMs != null && startDateMs <= Date.now();
}

function assertMatchScoreShape(score) {
  const resultType = score?.resultType || "standard";
  const teamA = Array.isArray(score?.teamA) ? score.teamA : [];
  const teamB = Array.isArray(score?.teamB) ? score.teamB : [];

  if (teamA.length !== teamB.length) {
    const err = new Error("score.teamA and score.teamB must contain the same number of set values");
    err.statusCode = 400;
    throw err;
  }

  if (resultType === "standard" && teamA.length === 0) {
    const err = new Error("Standard match results require at least one scored set");
    err.statusCode = 400;
    throw err;
  }

  // Validate every set value is a non-negative integer — prevents NaN or negative
  // scores from silently corrupting standings calculations.
  if (resultType === "standard") {
    for (let i = 0; i < teamA.length; i += 1) {
      const a = Number(teamA[i]);
      const b = Number(teamB[i]);
      if (!Number.isInteger(a) || a < 0 || !Number.isInteger(b) || b < 0) {
        const err = new Error(`Set ${i + 1} contains an invalid score value — scores must be non-negative integers`);
        err.statusCode = 400;
        throw err;
      }
    }
  }
}

function getActiveTeamsCount(tournament) {
  return (tournament?.teams || []).filter((team) => ["pending", "approved"].includes(team.status)).length;
}

function isTournamentWaitlistOpen(tournament) {
  if (!tournament) return false;
  if (["draft", "cancelled", "completed"].includes(tournament.status)) return false;
  if (hasTournamentStarted(tournament)) return false;
  if (isRegistrationClosedByTime(tournament)) return false;
  if (getTournamentStateSummary(tournament).hasBracket) return false;
  return getActiveTeamsCount(tournament) >= tournament.maxTeams;
}

const publicTournamentActivityActions = new Set([
  "published",
  "registration_open",
  "registration_closed",
  "registration_auto_opened",
  "registration_auto_closed",
  "bracket_generated",
  "match_scheduled",
  "match_rescheduled",
  "match_result_recorded",
  "status_in_progress",
  "status_completed",
  "completed",
  "cancelled",
]);

function getTournamentDashboardLink(role, tournamentId) {
  if (role === "admin") return `/dashboard/admin/tournaments/${tournamentId}`;
  if (role === "manager") return `/dashboard/manager/tournaments/${tournamentId}`;
  return `/dashboard/player/tournaments/${tournamentId}`;
}

function pushNotification(notifications, input) {
  if (!input?.userId || !input?.title || !input?.message) return;
  notifications.push(input);
}

function buildTournamentRegistrationNotifications(tournament, team, actorUser) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  pushNotification(notifications, {
    userId: team.captainUserId,
    actorUserId: actorUser.id,
    type: "info",
    category: "tournament",
    title: "Team registration submitted",
    titleAr: "تم إرسال تسجيل الفريق",
    message: `${team.teamName} was submitted to ${tournamentTitleEn} and is waiting for review.`,
    messageAr: `تم إرسال ${team.teamName} إلى ${tournamentTitleAr} وهو الآن بانتظار المراجعة.`,
    link: getTournamentDashboardLink("player", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      teamId: team.id,
      teamName: team.teamName,
      status: team.status,
    },
  });

  if (tournament.managerId && tournament.managerId !== team.captainUserId) {
    pushNotification(notifications, {
      userId: tournament.managerId,
      actorUserId: actorUser.id,
      type: "info",
      category: "tournament",
      title: "New team registration needs review",
      titleAr: "يوجد تسجيل فريق جديد بانتظار المراجعة",
      message: `${team.teamName} has registered for ${tournamentTitleEn}.`,
      messageAr: `قام ${team.teamName} بالتسجيل في ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("manager", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        teamId: team.id,
        teamName: team.teamName,
      },
    });
  }

  return notifications;
}

function buildTournamentWithdrawalNotifications(tournament, team, actorUser) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  if (actorUser.role === "player" && tournament.managerId) {
    pushNotification(notifications, {
      userId: tournament.managerId,
      actorUserId: actorUser.id,
      type: "warning",
      category: "tournament",
      title: "A team withdrew from the tournament",
      titleAr: "انسحب فريق من البطولة",
      message: `${team.teamName} withdrew from ${tournamentTitleEn}.`,
      messageAr: `انسحب ${team.teamName} من ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("manager", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        teamId: team.id,
        teamName: team.teamName,
      },
    });
  } else {
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: actorUser.id,
      type: "warning",
      category: "tournament",
      title: "Your team registration was withdrawn",
      titleAr: "تم سحب تسجيل فريقك",
      message: `${team.teamName} is no longer registered in ${tournamentTitleEn}.`,
      messageAr: `لم يعد ${team.teamName} مسجلاً في ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        teamId: team.id,
        teamName: team.teamName,
      },
    });
  }

  return notifications;
}

function buildTournamentReviewNotifications(tournament, teams, status, notes, actorUser) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";
  const normalizedNotes = notes ? String(notes).trim() : "";

  for (const team of teams) {
    if (!team?.captainUserId) continue;
    const approved = status === "approved";
    const englishNote = normalizedNotes ? ` Note: ${normalizedNotes}` : "";
    const arabicNote = normalizedNotes ? ` ملاحظة: ${normalizedNotes}` : "";
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: actorUser.id,
      type: approved ? "success" : "warning",
      category: "tournament",
      title: approved ? "Team approved" : "Team registration rejected",
      titleAr: approved ? "تم قبول الفريق" : "تم رفض تسجيل الفريق",
      message: approved
        ? `${team.teamName} was approved for ${tournamentTitleEn}.${englishNote}`
        : `${team.teamName} was not approved for ${tournamentTitleEn}.${englishNote}`,
      messageAr: approved
        ? `تم قبول ${team.teamName} للمشاركة في ${tournamentTitleAr}.${arabicNote}`
        : `لم تتم الموافقة على ${team.teamName} للمشاركة في ${tournamentTitleAr}.${arabicNote}`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        teamId: team.id,
        teamName: team.teamName,
        status,
        notes: normalizedNotes || null,
      },
    });
  }

  return notifications;
}

function buildTournamentWaitlistJoinedNotifications(tournament, entry, actorUser) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  pushNotification(notifications, {
    userId: entry.captainUserId,
    actorUserId: actorUser.id,
    type: "info",
    category: "tournament",
    title: "You joined the tournament waitlist",
    titleAr: "تمت إضافتك إلى قائمة الانتظار",
    message: `${entry.teamName} joined the waitlist for ${tournamentTitleEn}.`,
    messageAr: `تمت إضافة ${entry.teamName} إلى قائمة انتظار ${tournamentTitleAr}.`,
    link: getTournamentDashboardLink("player", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      waitlistEntryId: entry.id,
      teamName: entry.teamName,
      status: entry.status,
    },
  });

  if (tournament.managerId && tournament.managerId !== entry.captainUserId) {
    pushNotification(notifications, {
      userId: tournament.managerId,
      actorUserId: actorUser.id,
      type: "info",
      category: "tournament",
      title: "New team joined the waitlist",
      titleAr: "انضم فريق جديد إلى قائمة الانتظار",
      message: `${entry.teamName} joined the waitlist for ${tournamentTitleEn}.`,
      messageAr: `انضم ${entry.teamName} إلى قائمة انتظار ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("manager", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        waitlistEntryId: entry.id,
        teamName: entry.teamName,
      },
    });
  }

  return notifications;
}

function buildTournamentWaitlistRemovedNotifications(tournament, entry, actorUser, status) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  if (status === "withdrawn" && actorUser.role === "player") {
    if (tournament.managerId) {
      pushNotification(notifications, {
        userId: tournament.managerId,
        actorUserId: actorUser.id,
        type: "warning",
        category: "tournament",
        title: "A team left the waitlist",
        titleAr: "غادر فريق قائمة الانتظار",
        message: `${entry.teamName} left the waitlist for ${tournamentTitleEn}.`,
        messageAr: `غادر ${entry.teamName} قائمة انتظار ${tournamentTitleAr}.`,
        link: getTournamentDashboardLink("manager", tournament.id),
        metadata: {
          tournamentId: tournament.id,
          waitlistEntryId: entry.id,
          teamName: entry.teamName,
          status,
        },
      });
    }
    return notifications;
  }

  pushNotification(notifications, {
    userId: entry.captainUserId,
    actorUserId: actorUser.id,
    type: "warning",
    category: "tournament",
    title: status === "removed" ? "You were removed from the waitlist" : "You left the waitlist",
    titleAr: status === "removed" ? "تمت إزالتك من قائمة الانتظار" : "غادرت قائمة الانتظار",
    message:
      status === "removed"
        ? `${entry.teamName} is no longer on the waitlist for ${tournamentTitleEn}.`
        : `${entry.teamName} is no longer on the waitlist for ${tournamentTitleEn}.`,
    messageAr:
      status === "removed"
        ? `لم يعد ${entry.teamName} ضمن قائمة انتظار ${tournamentTitleAr}.`
        : `لم يعد ${entry.teamName} ضمن قائمة انتظار ${tournamentTitleAr}.`,
    link: getTournamentDashboardLink("player", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      waitlistEntryId: entry.id,
      teamName: entry.teamName,
      status,
    },
  });

  return notifications;
}

function buildTournamentWaitlistPromotedNotifications(tournament, entry, promotedTeam, actorUser) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  pushNotification(notifications, {
    userId: entry.captainUserId,
    actorUserId: actorUser.id,
    type: "success",
    category: "tournament",
    title: "A spot opened and your team was promoted",
    titleAr: "توفر مكان وتمت ترقية فريقك",
    message: `${promotedTeam.teamName} was promoted from the waitlist into ${tournamentTitleEn}.`,
    messageAr: `تمت ترقية ${promotedTeam.teamName} من قائمة الانتظار إلى ${tournamentTitleAr}.`,
    link: getTournamentDashboardLink("player", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      waitlistEntryId: entry.id,
      teamId: promotedTeam.id,
      teamName: promotedTeam.teamName,
      status: "approved",
    },
  });

  if (actorUser.role === "admin" && tournament.managerId && tournament.managerId !== actorUser.id) {
    pushNotification(notifications, {
      userId: tournament.managerId,
      actorUserId: actorUser.id,
      type: "info",
      category: "tournament",
      title: "A waitlisted team was promoted",
      titleAr: "تمت ترقية فريق من قائمة الانتظار",
      message: `${promotedTeam.teamName} was promoted into ${tournamentTitleEn}.`,
      messageAr: `تمت ترقية ${promotedTeam.teamName} إلى ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("manager", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        waitlistEntryId: entry.id,
        teamId: promotedTeam.id,
        teamName: promotedTeam.teamName,
      },
    });
  }

  return notifications;
}

function buildTournamentStatusNotifications(tournament, nextStatus, actorUser) {
  if (!["cancelled", "completed"].includes(nextStatus)) return [];

  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";
  const activeTeams = (tournament.teams || []).filter((team) =>
    ["approved", "pending"].includes(team.status),
  );

  for (const team of activeTeams) {
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: actorUser.id,
      type: nextStatus === "completed" ? "success" : "warning",
      category: "tournament",
      title: nextStatus === "completed" ? "Tournament completed" : "Tournament cancelled",
      titleAr: nextStatus === "completed" ? "اكتملت البطولة" : "تم إلغاء البطولة",
      message: nextStatus === "completed"
        ? `${tournamentTitleEn} has been completed.`
        : `${tournamentTitleEn} has been cancelled.`,
      messageAr: nextStatus === "completed"
        ? `اكتملت ${tournamentTitleAr}.`
        : `تم إلغاء ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        teamId: team.id,
        status: nextStatus,
      },
    });
  }

  return notifications;
}

function buildTournamentInProgressNotifications(tournament) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";
  const activeTeams = (tournament.teams || []).filter((team) =>
    ["approved", "pending"].includes(team.status),
  );

  for (const team of activeTeams) {
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: null,
      type: "info",
      category: "tournament",
      title: "Tournament is now in progress",
      titleAr: "البطولة بدأت الآن",
      message: `${tournamentTitleEn} has started and scheduled matches are now live.`,
      messageAr: `بدأت ${tournamentTitleAr} وأصبحت المباريات المجدولة جارية الآن.`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        status: "in_progress",
      },
    });
  }

  if (tournament.managerId) {
    pushNotification(notifications, {
      userId: tournament.managerId,
      actorUserId: null,
      type: "info",
      category: "tournament",
      title: "Tournament moved to in progress",
      titleAr: "انتقلت البطولة إلى حالة جارية",
      message: `${tournamentTitleEn} is now live because scheduled matches have started.`,
      messageAr: `أصبحت ${tournamentTitleAr} جارية الآن لأن المباريات المجدولة قد بدأت.`,
      link: getTournamentDashboardLink("manager", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        status: "in_progress",
      },
    });
  }

  return notifications;
}

function buildTournamentRegistrationAutoClosedNotifications(tournament, reason) {
  if (!tournament?.managerId) return [];

  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";
  const reasonMessageEn = reason === "tournament_started"
    ? `${tournamentTitleEn} reached its start time and registration was closed automatically.`
    : reason === "deadline_passed"
      ? `${tournamentTitleEn} reached the registration deadline and was closed automatically.`
      : `${tournamentTitleEn} reached maximum team capacity and registration was closed automatically.`;
  const reasonMessageAr = reason === "tournament_started"
    ? `وصلت ${tournamentTitleAr} إلى وقت البداية وتم إغلاق التسجيل تلقائياً.`
    : reason === "deadline_passed"
      ? `وصلت ${tournamentTitleAr} إلى موعد إغلاق التسجيل وتم إغلاقه تلقائياً.`
      : `وصلت ${tournamentTitleAr} إلى الحد الأقصى للفرق وتم إغلاق التسجيل تلقائياً.`;

  return [{
    userId: tournament.managerId,
    actorUserId: null,
    type: "info",
    category: "tournament",
    title: "Registration closed automatically",
    titleAr: "تم إغلاق التسجيل تلقائياً",
    message: reasonMessageEn,
    messageAr: reasonMessageAr,
    link: getTournamentDashboardLink("manager", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      status: "registration_closed",
      reason,
    },
  }];
}

function buildTournamentRegistrationAutoOpenedNotifications(tournament) {
  if (!tournament?.managerId) return [];

  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  return [{
    userId: tournament.managerId,
    actorUserId: null,
    type: "info",
    category: "tournament",
    title: "Registration opened automatically",
    titleAr: "تم فتح التسجيل تلقائياً",
    message: `${tournamentTitleEn} reached its registration opening time and is now accepting teams.`,
    messageAr: `وصلت ${tournamentTitleAr} إلى وقت فتح التسجيل وهي تقبل الفرق الآن.`,
    link: getTournamentDashboardLink("manager", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      status: "registration_open",
      reason: "open_time_reached",
    },
  }];
}

function getNextWaitingWaitlistEntry(tournament) {
  const waitingEntries = (tournament?.waitlistEntries || []).filter((entry) => entry.status === "waiting");
  if (!waitingEntries.length) return null;

  return waitingEntries
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
}

function buildTournamentWaitlistSpotOpenedNotifications(tournament, nextEntry, actorUser) {
  if (!nextEntry?.captainUserId) return [];

  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  pushNotification(notifications, {
    userId: nextEntry.captainUserId,
    actorUserId: actorUser?.id || null,
    type: "info",
    category: "tournament",
    title: "A tournament spot just opened",
    titleAr: "توفر مكان شاغر في البطولة",
    message: `A spot opened in ${tournamentTitleEn}. ${nextEntry.teamName} is now next on the waitlist.`,
    messageAr: `توفر مكان شاغر في ${tournamentTitleAr}. أصبح ${nextEntry.teamName} الآن في مقدمة قائمة الانتظار.`,
    link: getTournamentDashboardLink("player", tournament.id),
    metadata: {
      tournamentId: tournament.id,
      waitlistEntryId: nextEntry.id,
      teamName: nextEntry.teamName,
      status: nextEntry.status,
    },
  });

  if (tournament.managerId && tournament.managerId !== nextEntry.captainUserId) {
    pushNotification(notifications, {
      userId: tournament.managerId,
      actorUserId: actorUser?.id || null,
      type: "info",
      category: "tournament",
      title: "Waitlist promotion is ready",
      titleAr: "أصبحت ترقية قائمة الانتظار جاهزة",
      message: `A slot opened in ${tournamentTitleEn}. ${nextEntry.teamName} is next in line to be promoted.`,
      messageAr: `توفر مكان شاغر في ${tournamentTitleAr}. ${nextEntry.teamName} هو الفريق التالي للترقية.`,
      link: getTournamentDashboardLink("manager", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        waitlistEntryId: nextEntry.id,
        teamName: nextEntry.teamName,
        status: nextEntry.status,
      },
    });
  }

  return notifications;
}

function buildBracketGeneratedNotifications(tournament, teams, actorUser) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";

  for (const team of teams) {
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: actorUser.id,
      type: "info",
      category: "tournament",
      title: "Tournament bracket is ready",
      titleAr: "تم تجهيز جدول البطولة",
      message: `The bracket for ${tournamentTitleEn} is now available.`,
      messageAr: `أصبح جدول ${tournamentTitleAr} متاحاً الآن.`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        teamId: team.id,
        teamName: team.teamName,
      },
    });
  }

  return notifications;
}

function buildMatchScheduledNotifications(tournament, match, actorUser, options = {}) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";
  const courtNameEn = match.court?.nameEn || match.court?.name || "the selected court";
  const courtNameAr = match.court?.name || match.court?.nameEn || "الملعب المختار";
  const title = options.rescheduled ? "Match rescheduled" : "Match scheduled";
  const titleAr = options.rescheduled ? "تمت إعادة جدولة المباراة" : "تمت جدولة المباراة";
  const teams = [match.teamA, match.teamB].filter(Boolean);

  for (const team of teams) {
    if (!team?.captainUserId) continue;
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: actorUser.id,
      type: options.rescheduled ? "warning" : "info",
      category: "tournament",
      title,
      titleAr,
      message: `${match.teamA?.teamName || "TBD"} vs ${match.teamB?.teamName || "TBD"} in ${tournamentTitleEn} is set for ${formatDateValue(match.startAt)} on ${courtNameEn}.`,
      messageAr: `تم تحديد مباراة ${match.teamA?.teamName || "الفريق الأول"} ضد ${match.teamB?.teamName || "الفريق الثاني"} في ${tournamentTitleAr} بتاريخ ${formatDateValue(match.startAt)} على ${courtNameAr}.`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        matchId: match.id,
        teamId: team.id,
        startAt: formatDateValue(match.startAt),
        endAt: formatDateValue(match.endAt),
        courtId: match.courtId,
      },
    });
  }

  return notifications;
}

function buildMatchResultNotifications(tournament, match, teamsById, actorUser, payload) {
  const notifications = [];
  const tournamentTitleEn = tournament.title || "the tournament";
  const tournamentTitleAr = tournament.titleAr || tournament.title || "البطولة";
  const recipientTeams = [teamsById.get(match.teamAId), teamsById.get(match.teamBId)].filter(Boolean);
  const winnerTeam = teamsById.get(payload.winnerTeamId);

  for (const team of recipientTeams) {
    pushNotification(notifications, {
      userId: team.captainUserId,
      actorUserId: actorUser.id,
      type: "success",
      category: "tournament",
      title: "Match result recorded",
      titleAr: "تم تسجيل نتيجة المباراة",
      message: `${winnerTeam?.teamName || "A team"} won the round ${match.roundNumber} match in ${tournamentTitleEn}.`,
      messageAr: `فاز ${winnerTeam?.teamName || "أحد الفرق"} في مباراة الجولة ${match.roundNumber} ضمن ${tournamentTitleAr}.`,
      link: getTournamentDashboardLink("player", tournament.id),
      metadata: {
        tournamentId: tournament.id,
        matchId: match.id,
        teamId: team.id,
        winnerTeamId: payload.winnerTeamId,
        score: payload.score || null,
      },
    });
  }

  return notifications;
}

function serializeTeam(team, currentUser) {
  if (!team) return team;
  const canSeePhone = currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.id === team.captainUserId;
  const isPublicPlayer = !currentUser || (currentUser?.role === "player" && currentUser?.id !== team.captainUserId);
  return {
    id: team.id,
    tournamentId: team.tournamentId,
    teamName: team.teamName,
    captainUserId: team.captainUserId,
    captainName: team.captain?.name || null,
    partnerName: team.partnerName,
    partnerPhone: canSeePhone ? team.partnerPhone : null,
    status: team.status,
    seed: team.seed,
    groupId: team.groupId || null,
    notes: isPublicPlayer ? null : team.notes,
    createdAt: formatDateValue(team.createdAt),
    updatedAt: formatDateValue(team.updatedAt),
  };
}

function serializeWaitlistEntry(entry, currentUser, options = {}) {
  if (!entry) return entry;
  const canSeePhone = currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.id === entry.captainUserId;
  const isPrivateViewer = !currentUser || (currentUser?.role === "player" && currentUser?.id !== entry.captainUserId);
  return {
    id: entry.id,
    tournamentId: entry.tournamentId,
    captainUserId: entry.captainUserId,
    captainName: entry.captain?.name || null,
    teamName: entry.teamName,
    partnerName: entry.partnerName || null,
    partnerPhone: canSeePhone ? entry.partnerPhone || null : null,
    status: entry.status,
    notes: isPrivateViewer ? null : entry.notes || null,
    promotedTeamId: entry.promotedTeamId || null,
    position: options.position ?? null,
    promotedAt: formatDateValue(entry.promotedAt),
    removedAt: formatDateValue(entry.removedAt),
    createdAt: formatDateValue(entry.createdAt),
    updatedAt: formatDateValue(entry.updatedAt),
  };
}

function serializeActivity(activity) {
  if (!activity) return activity;
  return {
    id: activity.id,
    tournamentId: activity.tournamentId,
    actorUserId: activity.actorUserId || null,
    actorName: activity.actor?.businessName || activity.actor?.name || null,
    actorRole: activity.actor?.role || null,
    action: activity.action,
    title: activity.title,
    description: activity.description || null,
    metadata: activity.metadata || null,
    createdAt: formatDateValue(activity.createdAt),
  };
}

function serializeMatch(match) {
  if (!match) return match;
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    stage: match.stage || null,
    groupId: match.groupId || null,
    roundNumber: match.roundNumber,
    matchNumber: match.matchNumber,
    status: match.status,
    startAt: formatDateValue(match.startAt),
    endAt: formatDateValue(match.endAt),
    teamACheckedInAt: formatDateValue(match.teamACheckedInAt),
    teamBCheckedInAt: formatDateValue(match.teamBCheckedInAt),
    scoreJson: match.scoreJson || null,
    closureId: match.closureId || null,
    createdAt: formatDateValue(match.createdAt),
    updatedAt: formatDateValue(match.updatedAt),
    courtId: match.courtId || null,
    courtName: match.court?.name || null,
    courtNameEn: match.court?.nameEn || null,
    teamAId: match.teamAId || null,
    teamAName: match.teamA?.teamName || null,
    teamBId: match.teamBId || null,
    teamBName: match.teamB?.teamName || null,
    winnerTeamId: match.winnerTeamId || null,
    winnerTeamName: match.winnerTeam?.teamName || null,
  };
}

function getFinalMatch(matches = []) {
  return matches.reduce((acc, match) => {
    if (!acc) return match;
    if (match.roundNumber > acc.roundNumber) return match;
    if (match.roundNumber === acc.roundNumber && match.matchNumber > acc.matchNumber) return match;
    return acc;
  }, null);
}

function getTournamentStateSummary(tournament) {
  const matches = tournament?.matches || [];
  const hasBracket = matches.length > 0;
  const hasStartedMatches = matches.some((match) => ["scheduled", "completed"].includes(match.status));
  const hasIncompleteMatches = matches.some((match) => match.status !== "completed");
  const finalMatch = getFinalMatch(matches);
  return {
    hasBracket,
    hasStartedMatches,
    hasIncompleteMatches,
    finalMatch,
    hasWinner: Boolean(finalMatch?.winnerTeamId),
  };
}

function assertBracketNotLocked(tournament, message) {
  const { hasBracket } = getTournamentStateSummary(tournament);
  if (hasBracket) {
    const err = new Error(message || "Registrations are locked after the bracket has been generated");
    err.statusCode = 409;
    throw err;
  }
}

function assertTournamentEditableForMatches(tournament, actionLabel) {
  if (["cancelled", "completed"].includes(tournament.status)) {
    const err = new Error(`Tournament is already ${tournament.status}`);
    err.statusCode = 409;
    throw err;
  }
  if (!["registration_closed", "in_progress"].includes(tournament.status)) {
    const err = new Error(`${actionLabel} is only allowed after the bracket is generated and registration is closed`);
    err.statusCode = 409;
    throw err;
  }
}

function assertTournamentCanReviewTeams(tournament) {
  if (!["registration_open", "registration_closed"].includes(tournament.status) || hasTournamentStarted(tournament)) {
    const err = new Error("Tournament registrations can only be reviewed before the bracket is generated or the tournament starts");
    err.statusCode = 409;
    throw err;
  }
  assertBracketNotLocked(tournament, "Approved teams cannot be changed after the bracket has been generated");
}

function assertTournamentWaitlistAvailable(tournament) {
  assertBracketNotLocked(tournament, "The waitlist is locked after the bracket has been generated");

  if (["draft", "cancelled", "completed"].includes(tournament.status)) {
    const err = new Error("The waitlist is only available while registration is open");
    err.statusCode = 409;
    throw err;
  }
  if (isRegistrationClosedByTime(tournament) || hasTournamentStarted(tournament)) {
    const err = new Error("The waitlist is closed because the registration window has ended");
    err.statusCode = 409;
    throw err;
  }
  if (getActiveTeamsCount(tournament) < tournament.maxTeams) {
    const err = new Error("The tournament still has open team slots, so players should register directly instead of joining the waitlist");
    err.statusCode = 409;
    throw err;
  }
}

function assertAllowedTournamentTransition(tournament, nextStatus) {
  const current = tournament.status;
  if (current === nextStatus) return;
  const { hasBracket, hasStartedMatches, hasIncompleteMatches, hasWinner } = getTournamentStateSummary(tournament);
  const activeTeamsCount = getActiveTeamsCount(tournament);

  const fail = (message) => {
    const err = new Error(message);
    err.statusCode = 409;
    throw err;
  };

  switch (nextStatus) {
    case "published":
      if (current !== "draft") fail("Only draft tournaments can be published");
      return;
    case "registration_open":
      if (!["published", "registration_closed"].includes(current)) fail("Registration can only be opened from a published tournament");
      if (hasBracket || hasStartedMatches) fail("Registration cannot be reopened after the bracket has been generated");
      if (isRegistrationClosedByTime(tournament)) fail("Registration close time has already passed. Update the registration window before reopening");
      if (hasTournamentStarted(tournament)) fail("Registration cannot be reopened after the tournament has already started");
      if (activeTeamsCount >= tournament.maxTeams) fail("Registration cannot be reopened because the tournament is already full");
      return;
    case "registration_closed":
      if (current !== "registration_open") fail("Registration can only be closed while it is open");
      return;
    case "cancelled":
      if (["cancelled", "completed"].includes(current)) fail(`Tournament is already ${current}`);
      return;
    case "in_progress":
      fail("Tournament status transitions to 'in_progress' automatically when scheduled matches begin. Schedule a match to advance the tournament.");
      return;
    case "completed":
      if (!["registration_closed", "in_progress"].includes(current)) fail("Tournament can only be completed after the bracket is generated");
      if (!hasWinner) fail("Tournament cannot be completed until a final winner is available");
      if (hasIncompleteMatches) fail("Tournament cannot be completed while there are unfinished matches");
      return;
    default:
      fail("Invalid tournament status transition");
  }
}

async function releaseTournamentClosures(tx, tournamentId) {
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { id: true, status: true, courtId: true, closureId: true },
  });
  const courtIds = [
    ...new Set(matches.filter((match) => match.closureId).map((match) => match.courtId).filter(Boolean)),
  ];
  for (const courtId of courtIds) {
    await lockCourt(tx, courtId);
  }
  const closureIds = matches.map((match) => match.closureId).filter(Boolean);
  if (closureIds.length) {
    await tx.courtClosure.deleteMany({ where: { id: { in: closureIds } } });
    await tx.tournamentMatch.updateMany({
      where: { id: { in: matches.filter((match) => match.closureId).map((match) => match.id) } },
      data: { closureId: null },
    });
  }
  const unfinishedMatches = matches.filter((match) => match.status !== "completed");
  if (unfinishedMatches.length) {
    await tx.tournamentMatch.updateMany({
      where: { id: { in: unfinishedMatches.map((match) => match.id) } },
      data: { status: "cancelled", courtId: null, startAt: null, endAt: null, closureId: null },
    });
  }
}

async function releaseTournamentMatchClosures(tx, tournamentId) {
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId, closureId: { not: null } },
    select: { id: true, courtId: true, closureId: true },
  });

  const courtIds = [...new Set(matches.map((match) => match.courtId).filter(Boolean))];
  for (const courtId of courtIds) {
    await lockCourt(tx, courtId);
  }

  const closureIds = matches.map((match) => match.closureId).filter(Boolean);
  if (closureIds.length) {
    await tx.courtClosure.deleteMany({ where: { id: { in: closureIds } } });
    await tx.tournamentMatch.updateMany({
      where: { id: { in: matches.map((match) => match.id) } },
      data: { closureId: null },
    });
  }
}

async function logTournamentActivity(tx, { tournamentId, actorUserId = null, action, title, description = null, metadata = null }) {
  await tx.tournamentActivity.create({
    data: {
      tournamentId,
      actorUserId,
      action,
      title,
      description,
      ...(metadata ? { metadata } : {}),
    },
  });
}

async function closeExpiredTournamentRegistrations(options = {}) {
  const force = Boolean(options?.force);
  if (!force && TOURNAMENT_REGISTRATION_SYNC_INTERVAL_MS > 0) {
    const nowMs = Date.now();
    if (closeExpiredTournamentRegistrationsPromise) {
      await closeExpiredTournamentRegistrationsPromise;
      return;
    }
    if (nowMs - lastTournamentRegistrationSyncAt < TOURNAMENT_REGISTRATION_SYNC_INTERVAL_MS) {
      return;
    }
  }

  const runSync = async () => {
    const now = new Date();
    const candidates = await prisma.tournament.findMany({
      where: {
        status: { in: ["published", "registration_open"] },
      },
      select: {
        id: true,
        title: true,
        titleAr: true,
        managerId: true,
        status: true,
        registrationOpenAt: true,
        registrationCloseAt: true,
        startDate: true,
        maxTeams: true,
        teams: { select: { status: true } },
      },
    });

    const transitions = candidates
      .map((tournament) => {
        const activeTeamsCount = getActiveTeamsCount(tournament);
        const openReached = tournament.registrationOpenAt && new Date(tournament.registrationOpenAt).getTime() <= now.getTime();
        const reachedStart = tournament.startDate && new Date(tournament.startDate).getTime() <= now.getTime();
        const deadlinePassed = tournament.registrationCloseAt && new Date(tournament.registrationCloseAt).getTime() < now.getTime();
        const full = activeTeamsCount >= tournament.maxTeams;
        const closeReason = reachedStart ? "tournament_started" : deadlinePassed ? "deadline_passed" : full ? "capacity_reached" : null;

        if (tournament.status === "registration_open") {
          return closeReason
            ? { tournament, nextStatus: "registration_closed", reason: closeReason }
            : null;
        }

        if (tournament.status === "published" && openReached) {
          return closeReason
            ? { tournament, nextStatus: "registration_closed", reason: closeReason }
            : { tournament, nextStatus: "registration_open", reason: "open_time_reached" };
        }

        return null;
      })
      .filter(Boolean);

    if (!transitions.length) return;

    await prisma.$transaction(async (tx) => {
      for (const transition of transitions) {
        const { tournament, nextStatus, reason } = transition;
        const updated = await tx.tournament.updateMany({
          where: { id: tournament.id, status: tournament.status },
          data: { status: nextStatus },
        });

        if (updated.count === 0) {
          continue;
        }

        if (nextStatus === "registration_open") {
          await logTournamentActivity(tx, {
            tournamentId: tournament.id,
            action: "registration_auto_opened",
            title: "Registration opened automatically",
            description: "Registration was opened automatically because the registration opening time was reached.",
            metadata: { reason },
          });
          await createNotificationsTx(
            tx,
            buildTournamentRegistrationAutoOpenedNotifications(tournament),
          );
          continue;
        }

        await logTournamentActivity(tx, {
          tournamentId: tournament.id,
          action: "registration_auto_closed",
          title: "Registration closed automatically",
          description: reason === "tournament_started"
            ? "Registration was closed automatically because the tournament start time was reached."
            : reason === "deadline_passed"
              ? "Registration was closed automatically because the registration deadline was reached."
              : "Registration was closed automatically because the tournament reached maximum team capacity.",
          metadata: { reason },
        });
        await createNotificationsTx(
          tx,
          buildTournamentRegistrationAutoClosedNotifications(tournament, reason),
        );
      }
    });
  };

  if (force || TOURNAMENT_REGISTRATION_SYNC_INTERVAL_MS === 0) {
    await runSync();
    lastTournamentRegistrationSyncAt = Date.now();
    return;
  }

  const syncPromise = (async () => {
    try {
      await runSync();
    } finally {
      lastTournamentRegistrationSyncAt = Date.now();
      closeExpiredTournamentRegistrationsPromise = null;
    }
  })();

  closeExpiredTournamentRegistrationsPromise = syncPromise;
  await syncPromise;
}

async function autoCloseTournamentIfFull(tx, tournamentId) {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      title: true,
      titleAr: true,
      managerId: true,
      status: true,
      maxTeams: true,
      teams: { select: { status: true } },
    },
  });

  if (!tournament || tournament.status !== "registration_open") return false;

  const activeTeamsCount = getActiveTeamsCount(tournament);
  if (activeTeamsCount < tournament.maxTeams) return false;

  await tx.tournament.update({
    where: { id: tournamentId },
    data: { status: "registration_closed" },
  });
  await logTournamentActivity(tx, {
    tournamentId,
    action: "registration_auto_closed",
    title: "Registration closed automatically",
    description: "Registration was closed automatically because the tournament reached maximum team capacity.",
    metadata: { reason: "capacity_reached" },
  });
  await createNotificationsTx(
    tx,
    buildTournamentRegistrationAutoClosedNotifications(tournament, "capacity_reached"),
  );

  return true;
}


function getFinalMatchFromKnockoutMatches(knockoutMatches) {
  if (!knockoutMatches?.length) return null;
  return knockoutMatches.reduce((latest, match) => {
    if (!latest) return match;
    if (match.roundNumber > latest.roundNumber) return match;
    if (match.roundNumber === latest.roundNumber && match.matchNumber > latest.matchNumber) return match;
    return latest;
  }, null);
}

function deriveCompetitionPhase(tournament) {
  if (!tournament) return "setup";
  if (tournament.competitionPhase) return tournament.competitionPhase;
  if (tournament.status === "completed") return "completed";
  if (tournament.status === "cancelled") return "cancelled";

  const matches = tournament.matches || [];
  const groupMatches = matches.filter((match) => match.stage === "group");
  const knockoutMatches = matches.filter((match) => match.stage === "knockout");
  const finalMatch = getFinalMatchFromKnockoutMatches(knockoutMatches);

  if (knockoutMatches.length > 0) {
    const nonFinalKnockoutMatches = knockoutMatches.filter((match) => match.id !== finalMatch?.id);
    const finalIsReady = Boolean(finalMatch?.teamAId && finalMatch?.teamBId);
    const earlierKnockoutComplete = nonFinalKnockoutMatches.every((match) => match.status === "completed");

    if (finalMatch && finalMatch.status !== "completed" && finalIsReady && earlierKnockoutComplete) {
      return "final";
    }
    return "knockout_stage";
  }

  if (groupMatches.length > 0) return "group_stage";
  if (tournament.status === "registration_closed") return "draw_pending";
  if (["published", "registration_open"].includes(tournament.status)) return "registration";
  return "setup";
}

function serializeTournament(tournament, currentUser) {
  if (!tournament) return tournament;
  const canManageTournament = currentUser?.role === "admin" || currentUser?.role === "manager";
  const providedStats = tournament.stats || null;
  const visibleTeams = !currentUser
    ? (tournament.teams || []).filter((team) => team.status === "approved")
    : canManageTournament
      ? tournament.teams || []
      : (tournament.teams || []).filter(
          (team) => team.status === "approved" || team.captainUserId === currentUser.id,
        );
  const approvedTeams = providedStats?.approvedTeams
    ?? tournament.teams?.filter((team) => team.status === "approved").length
    ?? 0;
  const pendingTeams = providedStats?.pendingTeams
    ?? (
      canManageTournament
        ? tournament.teams?.filter((team) => team.status === "pending").length
        : visibleTeams.filter((team) => team.status === "pending").length
    )
    ?? 0;
  const waitlistEntries = tournament.waitlistEntries || [];
  const waitlistCount = providedStats?.waitlistCount
    ?? waitlistEntries.filter((entry) => entry.status === "waiting").length
    ?? 0;
  const completedMatches = providedStats?.completedMatches
    ?? tournament.matches?.filter((match) => match.status === "completed").length
    ?? 0;
  const totalMatches = providedStats?.totalMatches ?? tournament.matches?.length ?? 0;
  const activeRegistrations = providedStats?.activeRegistrations
    ?? visibleTeams.filter((team) => ["pending", "approved"].includes(team.status)).length;
  const finalMatch = tournament.matches?.reduce((acc, match) => {
    if (!acc) return match;
    if (match.roundNumber > acc.roundNumber) return match;
    if (match.roundNumber === acc.roundNumber && match.matchNumber > acc.matchNumber) return match;
    return acc;
  }, null);
  const visibleActivities = (tournament.activities || []).filter((activity) => {
    if (currentUser?.role === "admin" || currentUser?.role === "manager") return true;
    return publicTournamentActivityActions.has(activity.action);
  });
  const waitingPositions = new Map();
  waitlistEntries
    .filter((entry) => entry.status === "waiting")
    .forEach((entry, index) => {
      waitingPositions.set(entry.id, index + 1);
    });
  const visibleWaitlistEntries = currentUser?.role === "admin" || currentUser?.role === "manager"
    ? waitlistEntries
    : currentUser?.id
      ? waitlistEntries.filter((entry) => entry.captainUserId === currentUser.id)
      : [];

  return {
    id: tournament.id,
    title: tournament.title,
    titleAr: tournament.titleAr,
    description: tournament.description,
    descriptionAr: tournament.descriptionAr,
    managerId: tournament.managerId,
    managerName: tournament.manager?.businessName || tournament.manager?.name || null,
    status: tournament.status,
    format: tournament.format,
    competitionPhase: tournament.competitionPhase || deriveCompetitionPhase(tournament),
    teamSize: tournament.teamSize,
    teamsPerGroup: tournament.teamsPerGroup || 4,
    maxTeams: tournament.maxTeams,
    entryFee: tournament.entryFee == null ? null : Number(tournament.entryFee),
    registrationOpenAt: formatDateValue(tournament.registrationOpenAt),
    registrationCloseAt: formatDateValue(tournament.registrationCloseAt),
    startDate: formatDateValue(tournament.startDate),
    endDate: formatDateValue(tournament.endDate),
    rules: tournament.rules,
    coverImage: tournament.coverImage,
    createdAt: formatDateValue(tournament.createdAt),
    updatedAt: formatDateValue(tournament.updatedAt),
    courts: (tournament.courts || []).map((item) => ({
      id: item.court?.id || item.courtId,
      name: item.court?.name || null,
      nameEn: item.court?.nameEn || null,
      city: item.court?.city || null,
      cityEn: item.court?.cityEn || null,
      sportType: item.court?.sportType || null,
    })),
    teams: visibleTeams.map((team) => serializeTeam(team, currentUser)),
    matches: (tournament.matches || [])
      .slice()
      .sort((a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber)
      .map(serializeMatch),
    qualificationRules: {
      qualifiersPerGroup: 2,
      tieBreakers: ["wins", "points", "scoreDiff", "pointsScored", "seed"],
    },
    scorePolicy: {
      resultTypes: ["standard", "walkover", "retired"],
      description: "Choose the winner, then enter each set score as recorded. Every set where a team has the higher number gives that team 3 PTS; tied sets give 0 to both. Ranking uses wins, then PTS, then game difference, then games won.",
    },
    stats: {
      totalTeams: providedStats?.totalTeams ?? (canManageTournament ? tournament.teams?.length ?? 0 : visibleTeams.length),
      approvedTeams,
      pendingTeams,
      waitlistCount,
      totalMatches,
      completedMatches,
      activeRegistrations,
    },
    winner: tournament.winner
      || (finalMatch?.winnerTeam
        ? { id: finalMatch.winnerTeam.id, teamName: finalMatch.winnerTeam.teamName }
        : null),
    waitlistEntries: visibleWaitlistEntries.map((entry) =>
      serializeWaitlistEntry(entry, currentUser, { position: waitingPositions.get(entry.id) || null }),
    ),
    activities: visibleActivities.map(serializeActivity),
  };
}

function buildTournamentListStatsMap(teamRows, waitlistRows, matchRows, playerOwnedTeamRows = []) {
  const statsByTournament = new Map();

  const ensureStats = (tournamentId) => {
    if (!statsByTournament.has(tournamentId)) {
      statsByTournament.set(tournamentId, {
        totalTeams: 0,
        approvedTeams: 0,
        pendingTeams: 0,
        playerOwnedPendingTeams: 0,
        waitlistCount: 0,
        totalMatches: 0,
        completedMatches: 0,
      });
    }
    return statsByTournament.get(tournamentId);
  };

  for (const row of teamRows) {
    const count = Number(row?._count?._all || 0);
    const stats = ensureStats(row.tournamentId);
    stats.totalTeams += count;
    if (row.status === "approved") stats.approvedTeams += count;
    if (row.status === "pending") stats.pendingTeams += count;
  }

  for (const row of playerOwnedTeamRows) {
    const count = Number(row?._count?._all || 0);
    const stats = ensureStats(row.tournamentId);
    if (row.status === "pending") stats.playerOwnedPendingTeams += count;
  }

  for (const row of waitlistRows) {
    const count = Number(row?._count?._all || 0);
    const stats = ensureStats(row.tournamentId);
    if (row.status === "waiting") stats.waitlistCount += count;
  }

  for (const row of matchRows) {
    const count = Number(row?._count?._all || 0);
    const stats = ensureStats(row.tournamentId);
    stats.totalMatches += count;
    if (row.status === "completed") stats.completedMatches += count;
  }

  return statsByTournament;
}

function buildTournamentListPhaseMap(items, matchRows, knockoutRows) {
  const phasesByTournament = new Map();
  const matchStatsByTournament = new Map();
  const knockoutByTournament = new Map();

  const ensureMatchStats = (tournamentId) => {
    if (!matchStatsByTournament.has(tournamentId)) {
      matchStatsByTournament.set(tournamentId, {
        groupMatches: 0,
        completedGroupMatches: 0,
        knockoutMatches: 0,
      });
    }
    return matchStatsByTournament.get(tournamentId);
  };

  for (const row of matchRows || []) {
    const count = Number(row?._count?._all || 0);
    const stats = ensureMatchStats(row.tournamentId);
    if (row.stage === "group") {
      stats.groupMatches += count;
      if (row.status === "completed") stats.completedGroupMatches += count;
    }
    if (row.stage === "knockout") {
      stats.knockoutMatches += count;
    }
  }

  for (const match of knockoutRows || []) {
    if (!knockoutByTournament.has(match.tournamentId)) {
      knockoutByTournament.set(match.tournamentId, []);
    }
    knockoutByTournament.get(match.tournamentId).push(match);
  }

  for (const item of items || []) {
    if (item.status === "completed") {
      phasesByTournament.set(item.id, "completed");
      continue;
    }
    if (item.status === "cancelled") {
      phasesByTournament.set(item.id, "cancelled");
      continue;
    }

    const stats = matchStatsByTournament.get(item.id) || {
      groupMatches: 0,
      completedGroupMatches: 0,
      knockoutMatches: 0,
    };
    const knockoutMatches = knockoutByTournament.get(item.id) || [];
    const finalMatch = getFinalMatchFromKnockoutMatches(knockoutMatches);

    if (stats.knockoutMatches > 0) {
      const nonFinalKnockoutMatches = knockoutMatches.filter((match) => match.id !== finalMatch?.id);
      const finalIsReady = Boolean(finalMatch?.teamAId && finalMatch?.teamBId);
      const earlierKnockoutComplete = nonFinalKnockoutMatches.every((match) => match.status === "completed");
      phasesByTournament.set(
        item.id,
        finalMatch && finalMatch.status !== "completed" && finalIsReady && earlierKnockoutComplete
          ? "final"
          : "knockout_stage",
      );
      continue;
    }

    if (stats.groupMatches > 0) {
      phasesByTournament.set(item.id, "group_stage");
      continue;
    }

    if (item.status === "registration_closed") {
      phasesByTournament.set(item.id, "draw_pending");
      continue;
    }
    if (["published", "registration_open"].includes(item.status)) {
      phasesByTournament.set(item.id, "registration");
      continue;
    }
    phasesByTournament.set(item.id, "setup");
  }

  return phasesByTournament;
}

function buildTournamentWinnerMap(matches) {
  const winnerByTournament = new Map();

  for (const match of matches) {
    if (!match?.winnerTeam || winnerByTournament.has(match.tournamentId)) {
      continue;
    }

    winnerByTournament.set(match.tournamentId, {
      id: match.winnerTeam.id,
      teamName: match.winnerTeam.teamName,
    });
  }

  return winnerByTournament;
}

async function getCourtsForTournament(courtIds, currentUser, managerIdOverride) {
  const uniqueCourtIds = [...new Set((courtIds || []).filter(Boolean))];
  if (!uniqueCourtIds.length) {
    const err = new Error("At least one court must be selected");
    err.statusCode = 400;
    throw err;
  }

  const where = {
    id: { in: uniqueCourtIds },
    status: "active",
    ...(currentUser.role === "manager"
      ? { managerId: currentUser.id }
      : managerIdOverride
        ? { managerId: managerIdOverride }
        : {}),
  };

  const courts = await prisma.court.findMany({
    where,
    select: {
      id: true,
      name: true,
      nameEn: true,
      city: true,
      cityEn: true,
      sportType: true,
      managerId: true,
      openTime: true,
      closeTime: true,
      status: true,
    },
  });

  if (courts.length !== uniqueCourtIds.length) {
    const err = new Error("One or more selected courts are invalid or not accessible");
    err.statusCode = 400;
    throw err;
  }

  return courts;
}

async function getTournamentOrThrow(tournamentId, includeExtra = true) {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      manager: {
        select: { id: true, name: true, businessName: true },
      },
      courts: includeExtra ? { include: { court: true } } : false,
      teams: includeExtra
        ? {
            include: { captain: { select: { id: true, name: true, phone: true } } },
            orderBy: { createdAt: "asc" },
          }
        : false,
      waitlistEntries: includeExtra
        ? {
            include: {
              captain: { select: { id: true, name: true, phone: true } },
            },
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
          }
        : false,
      matches: includeExtra
        ? {
            include: {
              court: { select: { id: true, name: true, nameEn: true } },
              teamA: { select: { id: true, teamName: true } },
              teamB: { select: { id: true, teamName: true } },
              winnerTeam: { select: { id: true, teamName: true } },
            },
            orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
          }
        : false,
      activities: includeExtra
        ? {
            include: {
              actor: { select: { id: true, name: true, businessName: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          }
        : false,
    },
  });
}

function nextPowerOfTwo(value) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

const COMPETITION_GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function getCompetitionGroupLabel(index) {
  return COMPETITION_GROUP_LABELS[index] || `G${index + 1}`;
}

function compareCompetitionText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function getCompetitionSeed(team) {
  const seed = Number(team?.seed);
  return Number.isFinite(seed) && seed > 0 ? seed : Number.MAX_SAFE_INTEGER;
}

function sortTeamsForCompetition(teams = []) {
  return [...teams].sort((a, b) => {
    const seedDiff = getCompetitionSeed(a) - getCompetitionSeed(b);
    if (seedDiff !== 0) return seedDiff;

    const createdAtDiff = new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    const nameDiff = compareCompetitionText(a?.teamName, b?.teamName);
    if (nameDiff !== 0) return nameDiff;

    return compareCompetitionText(a?.id, b?.id);
  });
}

function sumCompetitionScore(values) {
  if (!Array.isArray(values)) return 0;
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function getValidStandardScoreArrays(score) {
  if ((score?.resultType || "standard") !== "standard") return null;
  const teamA = Array.isArray(score?.teamA) ? score.teamA : [];
  const teamB = Array.isArray(score?.teamB) ? score.teamB : [];

  if (teamA.length === 0 || teamA.length !== teamB.length) return null;

  const normalizedTeamA = [];
  const normalizedTeamB = [];
  for (let index = 0; index < teamA.length; index += 1) {
    const a = Number(teamA[index]);
    const b = Number(teamB[index]);
    if (!Number.isInteger(a) || a < 0 || !Number.isInteger(b) || b < 0) {
      return null;
    }
    normalizedTeamA.push(a);
    normalizedTeamB.push(b);
  }

  return { teamA: normalizedTeamA, teamB: normalizedTeamB };
}

function countWonSets(values, opponentValues) {
  if (!Array.isArray(values) || !Array.isArray(opponentValues)) return 0;
  if (values.length !== opponentValues.length) return 0;
  let wonSets = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    const opponentValue = Number(opponentValues[index]);
    if (Number.isFinite(value) && Number.isFinite(opponentValue) && value > opponentValue) {
      wonSets += 1;
    }
  }
  return wonSets;
}

function calculateCompetitionPoints(match, side) {
  const score = match?.scoreJson || null;
  const resultType = score?.resultType || "standard";
  if (resultType !== "standard") {
    const teamId = side === "teamA" ? match?.teamAId : match?.teamBId;
    return match?.winnerTeamId && match.winnerTeamId === teamId ? 3 : 0;
  }

  const scoreArrays = getValidStandardScoreArrays(score);
  if (!scoreArrays) return 0;

  const teamValues = scoreArrays[side];
  const opponentValues = scoreArrays[side === "teamA" ? "teamB" : "teamA"];
  return countWonSets(teamValues, opponentValues) * 3;
}

function buildCompetitionStandingRow(team) {
  return {
    id: team.id,
    teamName: team.teamName,
    groupId: team.groupId || null,
    seed: team.seed ?? null,
    played: 0,
    wins: 0,
    losses: 0,
    points: 0,
    scoreDiff: 0,
    pointsScored: 0,
  };
}

function compareCompetitionStandingRows(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.points !== a.points) return b.points - a.points;
  if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
  if (b.pointsScored !== a.pointsScored) return b.pointsScored - a.pointsScored;

  const seedDiff = getCompetitionSeed(a) - getCompetitionSeed(b);
  if (seedDiff !== 0) return seedDiff;

  const nameDiff = compareCompetitionText(a?.teamName, b?.teamName);
  if (nameDiff !== 0) return nameDiff;

  return compareCompetitionText(a?.id, b?.id);
}

function buildGroupStandings(teams = [], matches = []) {
  const rowsById = new Map();
  const groups = new Map();

  for (const team of sortTeamsForCompetition(teams).filter((item) => item?.groupId)) {
    const row = buildCompetitionStandingRow(team);
    rowsById.set(team.id, row);
    const groupRows = groups.get(team.groupId) || [];
    groupRows.push(row);
    groups.set(team.groupId, groupRows);
  }

  for (const match of matches) {
    if (match?.stage !== "group" || match.status !== "completed") continue;
    const teamA = match.teamAId ? rowsById.get(match.teamAId) : null;
    const teamB = match.teamBId ? rowsById.get(match.teamBId) : null;
    if (!teamA || !teamB) continue;

    teamA.played += 1;
    teamB.played += 1;

    if (match.winnerTeamId === match.teamAId) {
      teamA.wins += 1;
      teamB.losses += 1;
    } else if (match.winnerTeamId === match.teamBId) {
      teamB.wins += 1;
      teamA.losses += 1;
    }

    teamA.points += calculateCompetitionPoints(match, "teamA");
    teamB.points += calculateCompetitionPoints(match, "teamB");

    const standardScore = getValidStandardScoreArrays(match.scoreJson);
    if (standardScore) {
      const teamAPoints = sumCompetitionScore(standardScore.teamA);
      const teamBPoints = sumCompetitionScore(standardScore.teamB);
      teamA.pointsScored += teamAPoints;
      teamB.pointsScored += teamBPoints;
      teamA.scoreDiff += teamAPoints - teamBPoints;
      teamB.scoreDiff += teamBPoints - teamAPoints;
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => compareCompetitionText(a[0], b[0]))
    .map(([groupId, rows]) => ({
      groupId,
      rows: [...rows].sort(compareCompetitionStandingRows),
    }));
}

function buildCupStyleQualifierOrder(groupStandings = []) {
  const orderedGroups = [...groupStandings].sort((a, b) => compareCompetitionText(a.groupId, b.groupId));
  const orderedQualifiers = [];

  for (let index = 0; index < orderedGroups.length; index += 2) {
    const leftGroup = orderedGroups[index];
    const rightGroup = orderedGroups[index + 1];
    const leftFirst = leftGroup?.rows?.[0] ? { ...leftGroup.rows[0], qualificationRank: 1 } : null;
    const leftSecond = leftGroup?.rows?.[1] ? { ...leftGroup.rows[1], qualificationRank: 2 } : null;
    const rightFirst = rightGroup?.rows?.[0] ? { ...rightGroup.rows[0], qualificationRank: 1 } : null;
    const rightSecond = rightGroup?.rows?.[1] ? { ...rightGroup.rows[1], qualificationRank: 2 } : null;

    if (rightGroup) {
      if (leftFirst) orderedQualifiers.push(leftFirst);
      if (rightSecond) orderedQualifiers.push(rightSecond);
      if (rightFirst) orderedQualifiers.push(rightFirst);
      if (leftSecond) orderedQualifiers.push(leftSecond);
      continue;
    }

    if (leftFirst) orderedQualifiers.push(leftFirst);
    if (leftSecond) orderedQualifiers.push(leftSecond);
  }

  return orderedQualifiers;
}

function compareQualifiedTeamsForByes(a, b) {
  if ((a?.qualificationRank || 99) !== (b?.qualificationRank || 99)) {
    return (a?.qualificationRank || 99) - (b?.qualificationRank || 99);
  }

  return compareCompetitionStandingRows(a, b);
}

function buildCupStyleRoundOnePairs(groupStandings = []) {
  const qualifiers = buildCupStyleQualifierOrder(groupStandings);
  if (qualifiers.length < 2) return [];

  const bracketSize = nextPowerOfTwo(qualifiers.length);
  const byeCount = bracketSize - qualifiers.length;
  const byeTeamIds = new Set(
    qualifiers
      .slice()
      .sort(compareQualifiedTeamsForByes)
      .slice(0, byeCount)
      .map((team) => team.id),
  );
  const remaining = [...qualifiers];
  const pairs = [];

  while (remaining.length > 0) {
    const team = remaining.shift();
    if (!team) continue;

    if (byeTeamIds.has(team.id)) {
      pairs.push([team, null]);
      continue;
    }

    let opponentIndex = remaining.findIndex(
      (candidate) => candidate && !byeTeamIds.has(candidate.id) && candidate.groupId !== team.groupId,
    );
    if (opponentIndex === -1) {
      opponentIndex = remaining.findIndex((candidate) => candidate && !byeTeamIds.has(candidate.id));
    }

    if (opponentIndex === -1) {
      pairs.push([team, null]);
      continue;
    }

    const [opponent] = remaining.splice(opponentIndex, 1);
    pairs.push([team, opponent || null]);
  }

  while (pairs.length < bracketSize / 2) {
    pairs.push([null, null]);
  }

  return pairs;
}

function buildKnockoutStageMatches(groupStandings = [], startingMatchNumber = 1) {
  const roundOnePairs = buildCupStyleRoundOnePairs(groupStandings);
  if (!roundOnePairs.length) return [];

  const bracketSize = roundOnePairs.length * 2;
  const totalRounds = Math.log2(bracketSize);
  const knockoutMatches = [];
  let nextMatchNumber = startingMatchNumber;
  let matchesThisRound = bracketSize / 2;

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    for (let roundIndex = 0; roundIndex < matchesThisRound; roundIndex += 1) {
      const pair = roundNumber === 1 ? roundOnePairs[roundIndex] || [null, null] : [null, null];
      knockoutMatches.push({
        roundNumber,
        matchNumber: nextMatchNumber++,
        teamAId: pair?.[0]?.id || null,
        teamBId: pair?.[1]?.id || null,
        status: "pending",
        stage: "knockout",
      });
    }

    matchesThisRound = Math.floor(matchesThisRound / 2);
  }

  return knockoutMatches;
}

function getOrderedKnockoutRounds(matches = []) {
  const rounds = new Map();
  for (const match of matches) {
    const roundMatches = rounds.get(match.roundNumber) || [];
    roundMatches.push(match);
    rounds.set(match.roundNumber, roundMatches);
  }

  return Array.from(rounds.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, roundMatches]) => roundMatches.sort((a, b) => a.matchNumber - b.matchNumber));
}

function findKnockoutMatchPointer(rounds, matchId) {
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const matchIndex = rounds[roundIndex].findIndex((match) => match.id === matchId);
    if (matchIndex >= 0) {
      return { roundIndex, matchIndex, match: rounds[roundIndex][matchIndex] };
    }
  }

  return null;
}

function getNextKnockoutMatchPointer(rounds, roundIndex, matchIndex) {
  const nextRound = rounds[roundIndex + 1];
  if (!nextRound) return null;

  const nextMatchIndex = Math.floor(matchIndex / 2);
  const nextMatch = nextRound[nextMatchIndex];
  if (!nextMatch) return null;

  return {
    roundIndex: roundIndex + 1,
    matchIndex: nextMatchIndex,
    match: nextMatch,
    slotField: matchIndex % 2 === 0 ? "teamAId" : "teamBId",
  };
}

async function releaseMatchClosure(tx, match) {
  if (!match?.closureId) return;
  if (match.courtId) {
    await lockCourt(tx, match.courtId);
  }
  await tx.courtClosure.deleteMany({ where: { id: match.closureId } });
}

async function propagateAutomaticWinners(tx, tournamentId) {
  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId, stage: "knockout" },
    orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
  });
  if (!matches.length) return;

  const rounds = getOrderedKnockoutRounds(matches);
  const updatesById = new Map();
  const firstRoundNumber = rounds[0]?.[0]?.roundNumber || null;

  const mergeMatchUpdate = (matchId, patch) => {
    const current = updatesById.get(matchId) || {};
    updatesById.set(matchId, { ...current, ...patch });
  };

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const roundMatches = rounds[roundIndex];
    for (let matchIndex = 0; matchIndex < roundMatches.length; matchIndex += 1) {
      const match = roundMatches[matchIndex];

      let winnerTeamId = match.winnerTeamId;
      let status = match.status;
      if (!winnerTeamId && match.roundNumber === firstRoundNumber) {
        if (match.teamAId && !match.teamBId) {
          winnerTeamId = match.teamAId;
          status = "completed";
        } else if (!match.teamAId && match.teamBId) {
          winnerTeamId = match.teamBId;
          status = "completed";
        }
      }

      if (winnerTeamId && (!match.winnerTeamId || match.status !== status)) {
        match.winnerTeamId = winnerTeamId;
        match.status = status;
        mergeMatchUpdate(match.id, { winnerTeamId, status });
      }

      if (!winnerTeamId) continue;

      const nextPointer = getNextKnockoutMatchPointer(rounds, roundIndex, matchIndex);
      if (!nextPointer) continue;

      const { match: nextMatch, slotField } = nextPointer;
      if (nextMatch[slotField] !== winnerTeamId) {
        nextMatch[slotField] = winnerTeamId;
        mergeMatchUpdate(nextMatch.id, { [slotField]: winnerTeamId });
      }
    }
  }

  for (const match of matches) {
    const data = updatesById.get(match.id);
    if (!data) continue;
    await tx.tournamentMatch.update({
      where: { id: match.id },
      data,
    });
  }
}

async function syncTournamentLifecycleStatus(tx, tournamentId) {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      title: true,
      titleAr: true,
      managerId: true,
      status: true,
      teams: {
        select: {
          id: true,
          captainUserId: true,
          status: true,
        },
      },
    },
  });

  if (!tournament || ["cancelled", "completed"].includes(tournament.status)) {
    return tournament;
  }

  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: {
      id: true,
      status: true,
      startAt: true,
      winnerTeamId: true,
      roundNumber: true,
      matchNumber: true,
    },
    orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
  });

  if (matches.length === 0) {
    return tournament;
  }

  const finalMatch = getFinalMatch(matches);
  const hasIncompleteMatches = matches.some((match) => match.status !== "completed");
  const now = Date.now();
  const hasStartedCompetition = matches.some((match) => {
    if (match.status === "completed") return true;
    if (match.status !== "scheduled" || !match.startAt) return false;
    return new Date(match.startAt).getTime() <= now;
  });

  // Only allow forward progression — never revert to an earlier status.
  // Without this guard a tournament with future-scheduled matches would wrongly
  // fall back to "registration_closed" every time this sync runs.
  const statusOrder = ["draft", "published", "registration_open", "registration_closed", "in_progress", "completed"];
  let nextStatus = null;
  if (finalMatch?.winnerTeamId && !hasIncompleteMatches) {
    nextStatus = "completed";
  } else if (hasStartedCompetition) {
    nextStatus = "in_progress";
  }

  const currentRank = statusOrder.indexOf(tournament.status);
  const nextRank = nextStatus ? statusOrder.indexOf(nextStatus) : -1;
  if (!nextStatus || nextRank <= currentRank) {
    return tournament;
  }

  if (nextStatus !== tournament.status) {
    const updated = await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: nextStatus },
      select: { id: true, status: true },
    });
    await logTournamentActivity(tx, {
      tournamentId,
      action: nextStatus === "in_progress" ? "status_in_progress" : "status_completed",
      title: nextStatus === "in_progress" ? "Tournament moved to in progress" : "Tournament completed automatically",
      description: nextStatus === "in_progress"
        ? "The tournament moved to in-progress automatically because scheduled matches have started."
        : "The tournament was marked complete automatically after the final result was recorded.",
      metadata: { status: nextStatus },
    });
    await createNotificationsTx(
      tx,
      nextStatus === "in_progress"
        ? buildTournamentInProgressNotifications(tournament)
        : buildTournamentStatusNotifications(tournament, nextStatus, { id: null }),
    );
    return updated;
  }

  return tournament;
}

function buildRoundRobinMatchesForGroup(groupTeams, groupId, startingMatchNumber) {
  const teamIds = groupTeams.map((team) => team.id);
  const isOdd = teamIds.length % 2 !== 0;
  const rotation = isOdd ? [...teamIds, null] : [...teamIds];
  const roundsCount = Math.max(0, rotation.length - 1);
  const matches = [];
  let nextMatchNumber = startingMatchNumber;

  for (let roundNumber = 1; roundNumber <= roundsCount; roundNumber += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const teamAId = rotation[index];
      const teamBId = rotation[rotation.length - 1 - index];
      if (!teamAId || !teamBId) continue;

      matches.push({
        roundNumber,
        matchNumber: nextMatchNumber++,
        teamAId,
        teamBId,
        stage: "group",
        groupId,
        status: "pending",
      });
    }

    const last = rotation.pop();
    rotation.splice(1, 0, last);
  }

  return { matches, nextMatchNumber };
}

function assertValidDrawSeed(drawSeed) {
  if (drawSeed == null || drawSeed === "") return;
  if (typeof drawSeed !== "string") {
    const err = new Error("drawSeed must be a string");
    err.statusCode = 400;
    throw err;
  }
  if (drawSeed.length > 128) {
    const err = new Error("drawSeed must be at most 128 characters");
    err.statusCode = 400;
    throw err;
  }
  if (/[ -]/.test(drawSeed)) {
    const err = new Error("drawSeed contains invalid control characters");
    err.statusCode = 400;
    throw err;
  }
}

function normalizeDrawSeed(seed) {
  const raw = String(seed || "").trim();
  return raw || "default-draw";
}

function hashDrawSeed(seed) {
  let hash = 2166136261;
  for (const char of normalizeDrawSeed(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function drawRandom(seed) {
  let state = hashDrawSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296);
  };
}

function buildSeededTeamOrder(teams, drawSeed) {
  const ordered = sortTeamsForCompetition(teams);
  if (!drawSeed) return ordered;
  const random = drawRandom(drawSeed);
  const shuffled = [...ordered];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.map((team, index) => ({ ...team, seed: team.seed ?? index + 1 }));
}

function buildBalancedCompetitionGroups(orderedTeams, teamsPerGroup = 4) {
  const safeTeamsPerGroup = Math.max(2, Number(teamsPerGroup) || 4);
  if (!orderedTeams.length) return [];
  const groupCount = Math.max(1, Math.ceil(orderedTeams.length / safeTeamsPerGroup));
  const baseSize = Math.floor(orderedTeams.length / groupCount);
  const largerGroups = orderedTeams.length % groupCount;
  const groups = [];
  let cursor = 0;

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const size = baseSize + (groupIndex < largerGroups ? 1 : 0);
    groups.push(orderedTeams.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups.filter((group) => group.length > 0);
}

function buildTournamentDrawPreview(approvedTeams, teamsPerGroup = 4, drawSeed) {
  const orderedTeams = buildSeededTeamOrder(approvedTeams, drawSeed);
  const groups = buildBalancedCompetitionGroups(orderedTeams, teamsPerGroup).map((groupTeams, groupIndex) => ({
    groupId: getCompetitionGroupLabel(groupIndex),
    teams: groupTeams.map((team, offset) => ({
      id: team.id,
      teamName: team.teamName,
      captainName: team.captain?.name || null,
      seed: team.seed ?? groupIndex * teamsPerGroup + offset + 1,
    })),
  }));
  const knockoutTeams = groups.reduce((total, group) => total + Math.min(2, group.teams.length), 0);
  const nextPowerOfTwo = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, knockoutTeams))));
  const byes = Math.max(0, nextPowerOfTwo - knockoutTeams);
  return {
    drawSeed: normalizeDrawSeed(drawSeed),
    teamsPerGroup,
    groupsCount: groups.length,
    knockoutTeams,
    byes,
    groups,
    rules: {
      qualifiersPerGroup: 2,
      tieBreakers: ["wins", "points", "scoreDiff", "pointsScored", "seed"],
    },
  };
}

function buildManualDrawGroups(approvedTeams, drawGroups, teamsPerGroup = 4) {
  if (!Array.isArray(drawGroups) || drawGroups.length === 0) return null;

  const teamById = new Map(approvedTeams.map((team) => [team.id, team]));
  const seen = new Set();
  const groups = [];

  for (const group of drawGroups) {
    const ids = Array.isArray(group) ? group : Array.isArray(group?.teamIds) ? group.teamIds : [];
    const cleanedIds = ids.map((id) => String(id || '').trim()).filter(Boolean);

    if (cleanedIds.length < 2) {
      const err = new Error("Every draw group must contain at least two teams");
      err.statusCode = 400;
      throw err;
    }
    if (cleanedIds.length > teamsPerGroup) {
      const err = new Error(`A draw group cannot contain more than ${teamsPerGroup} teams`);
      err.statusCode = 400;
      throw err;
    }

    const groupTeams = [];
    for (const teamId of cleanedIds) {
      if (!teamById.has(teamId)) {
        const err = new Error("Manual draw contains a team that is not approved for this tournament");
        err.statusCode = 400;
        throw err;
      }
      if (seen.has(teamId)) {
        const err = new Error("Manual draw contains the same team more than once");
        err.statusCode = 400;
        throw err;
      }
      seen.add(teamId);
      groupTeams.push(teamById.get(teamId));
    }
    groups.push(groupTeams);
  }

  if (seen.size !== approvedTeams.length) {
    const err = new Error("Manual draw must include every approved team exactly once");
    err.statusCode = 400;
    throw err;
  }

  return groups;
}

function buildGroupStageMatches(approvedTeams, teamsPerGroup = 4, options = {}) {
  const manualGroups = buildManualDrawGroups(approvedTeams, options.drawGroups, teamsPerGroup);
  const groupedTeams = manualGroups || buildBalancedCompetitionGroups(
    buildSeededTeamOrder(approvedTeams, options.drawSeed),
    teamsPerGroup,
  );

  const groupMatches = [];
  const teamUpdates = [];
  let nextMatchNumber = 1;
  let nextSeed = 1;

  groupedTeams.forEach((groupTeams, groupIndex) => {
    const groupId = getCompetitionGroupLabel(groupIndex);
    const orderedGroupTeams = groupTeams.map((team) => ({
      ...team,
      seed: nextSeed++,
    }));

    for (const team of orderedGroupTeams) {
      teamUpdates.push({ id: team.id, groupId, seed: team.seed });
    }

    const roundRobin = buildRoundRobinMatchesForGroup(orderedGroupTeams, groupId, nextMatchNumber);
    groupMatches.push(...roundRobin.matches);
    nextMatchNumber = roundRobin.nextMatchNumber;
  });

  return { matches: groupMatches, teamUpdates };
}

async function rebuildPendingGroupStage(tx, tournamentId, approvedTeams, teamsPerGroup, options = {}) {
  const existingMatches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { id: true, closureId: true },
  });
  const staleClosureIds = existingMatches.map((match) => match.closureId).filter(Boolean);
  if (staleClosureIds.length) {
    await tx.courtClosure.deleteMany({ where: { id: { in: staleClosureIds } } });
  }

  await tx.tournamentMatch.deleteMany({ where: { tournamentId } });
  await tx.tournamentTeam.updateMany({ where: { tournamentId }, data: { groupId: null } });

  const blueprint = buildGroupStageMatches(approvedTeams, teamsPerGroup, options);
  for (const update of blueprint.teamUpdates) {
    await tx.tournamentTeam.update({
      where: { id: update.id },
      data: { groupId: update.groupId, seed: update.seed },
    });
  }

  if (blueprint.matches.length > 0) {
    await tx.tournamentMatch.createMany({
      data: blueprint.matches.map((match) => ({
        tournamentId,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        status: match.status,
        stage: match.stage,
        groupId: match.groupId,
      })),
    });
  }

  return blueprint;
}

function tournamentListWhere(query, currentUser) {
  const q = String(query?.q || "").trim();
  const publicStatuses = [...publicTournamentStatuses];
  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { titleAr: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query?.status ? { status: query.status } : {}),
  };

  if (currentUser.role === "manager") {
    where.managerId = currentUser.id;
  } else if (currentUser.role === "player") {
    if (query?.mine) {
      where.teams = { some: { captainUserId: currentUser.id } };
      where.status = { in: publicStatuses };
    }

    if (query?.status) {
      if (publicStatuses.includes(query.status)) {
        where.status = query.status;
      } else {
        where.id = "__no_public_tournaments__";
      }
    } else if (!where.status) {
      where.status = { in: publicStatuses };
    }
  }
  return where;
}

function mapSort(sortBy, order) {
  const direction = order === "asc" ? "asc" : "desc";
  if (sortBy === "title") return { title: direction };
  if (sortBy === "startDate") return { startDate: direction };
  if (sortBy === "status") return { status: direction };
  return { createdAt: direction };
}

export async function syncTournamentRegistrationWindowsService() {
  await closeExpiredTournamentRegistrations({ force: true });
  return { success: true };
}

export async function deleteTournamentService(tournamentId, currentUser) {
  assertManagerOrAdmin(currentUser);
  const tournament = await getTournamentOrThrow(tournamentId);
  assertTournamentAccess(tournament, currentUser);

  if (["in_progress", "completed"].includes(tournament.status) && currentUser.role !== "admin") {
    const err = new Error("Only admins can delete in-progress or completed tournaments");
    err.statusCode = 403;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await releaseTournamentMatchClosures(tx, tournamentId);
    await tx.tournament.delete({
      where: { id: tournamentId },
    });
  });

  return { success: true };
}

export async function listTournamentsService(query, currentUser) {
  await closeExpiredTournamentRegistrations();
  const page = Number.parseInt(query?.page, 10) || 1;
  const limit = Number.parseInt(query?.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const where = tournamentListWhere(query, currentUser);
  const orderBy = mapSort(query?.sortBy, query?.order);

  const [items, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      select: {
        id: true,
        title: true,
        titleAr: true,
        description: true,
        descriptionAr: true,
        managerId: true,
        status: true,
        format: true,
        teamSize: true,
        teamsPerGroup: true,
        maxTeams: true,
        entryFee: true,
        registrationOpenAt: true,
        registrationCloseAt: true,
        startDate: true,
        endDate: true,
        rules: true,
        coverImage: true,
        createdAt: true,
        updatedAt: true,
        manager: { select: { id: true, name: true, businessName: true } },
        courts: {
          select: {
            courtId: true,
            court: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                city: true,
                cityEn: true,
                sportType: true,
              },
            },
          },
        },
      },
      skip,
      take: limit,
      orderBy,
    }),
    prisma.tournament.count({ where }),
  ]);

  const tournamentIds = items.map((item) => item.id);
  const [teamRows, waitlistRows, matchRows, knockoutRows, winnerRows, playerOwnedTeamRows] = tournamentIds.length
    ? await Promise.all([
      prisma.tournamentTeam.groupBy({
        by: ["tournamentId", "status"],
        where: { tournamentId: { in: tournamentIds } },
        _count: { _all: true },
      }),
      prisma.tournamentWaitlistEntry.groupBy({
        by: ["tournamentId", "status"],
        where: { tournamentId: { in: tournamentIds } },
        _count: { _all: true },
      }),
      prisma.tournamentMatch.groupBy({
        by: ["tournamentId", "stage", "status"],
        where: { tournamentId: { in: tournamentIds } },
        _count: { _all: true },
      }),
      prisma.tournamentMatch.findMany({
        where: {
          tournamentId: { in: tournamentIds },
          stage: "knockout",
        },
        orderBy: [
          { tournamentId: "asc" },
          { roundNumber: "asc" },
          { matchNumber: "asc" },
        ],
        select: {
          id: true,
          tournamentId: true,
          roundNumber: true,
          matchNumber: true,
          status: true,
          teamAId: true,
          teamBId: true,
        },
      }),
      prisma.tournamentMatch.findMany({
        where: {
          tournamentId: { in: tournamentIds },
          winnerTeamId: { not: null },
        },
        orderBy: [
          { tournamentId: "asc" },
          { roundNumber: "desc" },
          { matchNumber: "desc" },
        ],
        select: {
          tournamentId: true,
          winnerTeam: { select: { id: true, teamName: true } },
        },
      }),
      currentUser?.role === "player"
        ? prisma.tournamentTeam.groupBy({
          by: ["tournamentId", "status"],
          where: {
            tournamentId: { in: tournamentIds },
            captainUserId: currentUser.id,
          },
          _count: { _all: true },
        })
        : Promise.resolve([]),
    ])
    : [[], [], [], [], [], []];

  const statsByTournament = buildTournamentListStatsMap(
    teamRows,
    waitlistRows,
    matchRows,
    playerOwnedTeamRows,
  );
  const phaseByTournament = buildTournamentListPhaseMap(items, matchRows, knockoutRows);
  const winnerByTournament = buildTournamentWinnerMap(winnerRows);

  return {
    items: items.map((item) => {
      const stats = statsByTournament.get(item.id) || {
        totalTeams: 0,
        approvedTeams: 0,
        pendingTeams: 0,
        playerOwnedPendingTeams: 0,
        waitlistCount: 0,
        totalMatches: 0,
        completedMatches: 0,
      };

      return serializeTournament({
        ...item,
        teams: [],
        matches: [],
        waitlistEntries: [],
        activities: [],
        competitionPhase: phaseByTournament.get(item.id) || null,
        qualificationRules: {
      qualifiersPerGroup: 2,
      tieBreakers: ["wins", "points", "scoreDiff", "pointsScored", "seed"],
    },
    scorePolicy: {
      resultTypes: ["standard", "walkover", "retired"],
      description: "Choose the winner, then enter each set score as recorded. Every set where a team has the higher number gives that team 3 PTS; tied sets give 0 to both. Ranking uses wins, then PTS, then game difference, then games won.",
    },
    stats: {
          totalTeams: stats.totalTeams,
          approvedTeams: stats.approvedTeams,
          pendingTeams: currentUser?.role === "player"
            ? stats.playerOwnedPendingTeams
            : stats.pendingTeams,
          waitlistCount: stats.waitlistCount,
          totalMatches: stats.totalMatches,
          completedMatches: stats.completedMatches,
          activeRegistrations: stats.approvedTeams + stats.pendingTeams,
        },
        winner: winnerByTournament.get(item.id) || null,
      }, currentUser);
    }),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getTournamentByIdService(tournamentId, currentUser) {
  await closeExpiredTournamentRegistrations();
  const tournament = await getTournamentOrThrow(tournamentId, true);
  assertTournamentAccess(tournament, currentUser);
  return serializeTournament(tournament, currentUser);
}

export async function getPublicTournamentByIdService(tournamentId) {
  await closeExpiredTournamentRegistrations();
  const tournament = await getTournamentOrThrow(tournamentId, true);
  assertPublicTournamentVisible(tournament);

  const publicStats = {
    totalTeams: tournament.teams?.length ?? 0,
    approvedTeams: tournament.teams?.filter((team) => team.status === "approved").length ?? 0,
    pendingTeams: tournament.teams?.filter((team) => team.status === "pending").length ?? 0,
    waitlistCount: tournament.waitlistEntries?.filter((entry) => entry.status === "waiting").length ?? 0,
    totalMatches: tournament.matches?.length ?? 0,
    completedMatches: tournament.matches?.filter((match) => match.status === "completed").length ?? 0,
  };
  publicStats.activeRegistrations = publicStats.approvedTeams + publicStats.pendingTeams;

  return serializeTournament({ ...tournament, stats: publicStats }, null);
}

export async function createTournamentService(payload, currentUser) {
  assertManagerOrAdmin(currentUser);
  assertTournamentTimelineWindow(payload);
  let managerId = currentUser.role === "manager" ? currentUser.id : payload.managerId;
  const courts = await getCourtsForTournament(payload.courtIds, currentUser, managerId);
  if (currentUser.role === "admin") {
    const managerIds = [...new Set(courts.map((court) => court.managerId))];
    if (managerIds.length !== 1) {
      const err = new Error("All tournament courts must belong to the same manager");
      err.statusCode = 400;
      throw err;
    }
    managerId = managerId || managerIds[0];
  }
  if (!managerId) {
    const err = new Error("managerId is required");
    err.statusCode = 400;
    throw err;
  }

  const tournament = await prisma.$transaction(async (tx) => {
    const created = await tx.tournament.create({
      data: {
        title: payload.title.trim(),
        titleAr: payload.titleAr?.trim() || null,
        description: payload.description?.trim() || null,
        descriptionAr: payload.descriptionAr?.trim() || null,
        managerId,
        teamsPerGroup: payload.teamsPerGroup || 4,
        maxTeams: payload.maxTeams,
        teamSize: 2,
        format: "group_stage_knockout",
        entryFee: payload.entryFee == null ? null : payload.entryFee,
        registrationOpenAt: payload.registrationOpenAt || null,
        registrationCloseAt: payload.registrationCloseAt || null,
        startDate: payload.startDate || null,
        endDate: payload.endDate || null,
        rules: payload.rules?.trim() || null,
        coverImage: payload.coverImage?.trim() || null,
        status: "draft",
        courts: { create: courts.map((court) => ({ courtId: court.id })) },
      },
      include: {
        manager: { select: { id: true, name: true, businessName: true } },
        courts: { include: { court: true } },
        teams: { include: { captain: { select: { id: true, name: true } } } },
        matches: true,
      },
    });
    await logTournamentActivity(tx, {
      tournamentId: created.id,
      actorUserId: currentUser.id,
      action: "created",
      title: "Tournament created",
      description: "Initial tournament settings were saved in draft mode.",
    });
    return created;
  });
  return serializeTournament(tournament, currentUser);
}

export async function updateTournamentService(tournamentId, payload, currentUser) {
  assertManagerOrAdmin(currentUser);
  const existing = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      matches: { select: { id: true, status: true } },
      manager: { select: { id: true, name: true, businessName: true } },
      courts: { include: { court: true } },
      teams: { include: { captain: { select: { id: true, name: true } } } },
    },
  });
  assertTournamentAccess(existing, currentUser);
  const hasScheduledOrCompletedMatches = existing.matches.some((match) => match.status === "scheduled" || match.status === "completed");
  const hasBracket = existing.matches.length > 0;
  const activeTeamsCount = existing.teams.filter((team) => ["pending", "approved"].includes(team.status)).length;
  const isTerminalTournament = ["completed", "cancelled"].includes(existing.status);
  const touchesTimelineFields = ["registrationOpenAt", "registrationCloseAt", "startDate", "endDate"].some((key) => payload[key] !== undefined);
  const nextMaxTeams = payload.maxTeams !== undefined ? payload.maxTeams : existing.maxTeams;
  const nextTeamsPerGroup = payload.teamsPerGroup !== undefined ? payload.teamsPerGroup : existing.teamsPerGroup || 4;
  const touchesBracketStructure = payload.maxTeams !== undefined || payload.teamsPerGroup !== undefined;
  const touchesStructuralFields = touchesBracketStructure || payload.courtIds !== undefined;
  assertTournamentTimelineWindow({
    registrationOpenAt: payload.registrationOpenAt !== undefined ? payload.registrationOpenAt : existing.registrationOpenAt,
    registrationCloseAt: payload.registrationCloseAt !== undefined ? payload.registrationCloseAt : existing.registrationCloseAt,
    startDate: payload.startDate !== undefined ? payload.startDate : existing.startDate,
    endDate: payload.endDate !== undefined ? payload.endDate : existing.endDate,
  });

  if (nextMaxTeams < activeTeamsCount) {
    const err = new Error(`maxTeams cannot be less than the current number of active registrations (${activeTeamsCount})`);
    err.statusCode = 409;
    throw err;
  }
  if (nextMaxTeams % nextTeamsPerGroup !== 0) {
    const err = new Error(`maxTeams (${nextMaxTeams}) must be a multiple of teamsPerGroup (${nextTeamsPerGroup})`);
    err.statusCode = 400;
    throw err;
  }

  if (payload.courtIds && hasScheduledOrCompletedMatches) {
    const err = new Error("Tournament courts cannot be changed after matches have been scheduled");
    err.statusCode = 409;
    throw err;
  }
  if ((touchesTimelineFields || touchesStructuralFields) && hasScheduledOrCompletedMatches) {
    const err = new Error("Tournament schedule settings cannot be changed after matches have been scheduled");
    err.statusCode = 409;
    throw err;
  }
  if ((touchesTimelineFields || touchesStructuralFields) && isTerminalTournament) {
    const err = new Error("Tournament schedule settings cannot be changed after the tournament is completed or cancelled");
    err.statusCode = 409;
    throw err;
  }
  if (touchesBracketStructure && hasScheduledOrCompletedMatches) {
    const err = new Error("Tournament bracket structure cannot be changed after any match has been scheduled or completed");
    err.statusCode = 409;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    if (payload.courtIds) {
      const courts = await getCourtsForTournament(payload.courtIds, currentUser, existing.managerId);
      await tx.tournamentCourt.deleteMany({ where: { tournamentId } });
      await tx.tournamentCourt.createMany({ data: courts.map((court) => ({ tournamentId, courtId: court.id })) });
    }

    const tournament = await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
        ...(payload.titleAr !== undefined ? { titleAr: payload.titleAr?.trim() || null } : {}),
        ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
        ...(payload.descriptionAr !== undefined ? { descriptionAr: payload.descriptionAr?.trim() || null } : {}),
        ...(payload.teamsPerGroup !== undefined ? { teamsPerGroup: payload.teamsPerGroup } : {}),
        ...(payload.maxTeams !== undefined ? { maxTeams: payload.maxTeams } : {}),
        ...(payload.entryFee !== undefined ? { entryFee: payload.entryFee == null ? null : payload.entryFee } : {}),
        ...(payload.registrationOpenAt !== undefined ? { registrationOpenAt: payload.registrationOpenAt || null } : {}),
        ...(payload.registrationCloseAt !== undefined ? { registrationCloseAt: payload.registrationCloseAt || null } : {}),
        ...(payload.startDate !== undefined ? { startDate: payload.startDate || null } : {}),
        ...(payload.endDate !== undefined ? { endDate: payload.endDate || null } : {}),
        ...(payload.rules !== undefined ? { rules: payload.rules?.trim() || null } : {}),
        ...(payload.coverImage !== undefined ? { coverImage: payload.coverImage?.trim() || null } : {}),
      },
      include: {
        manager: { select: { id: true, name: true, businessName: true } },
        courts: { include: { court: true } },
        teams: { include: { captain: { select: { id: true, name: true } } } },
        matches: {
          include: {
            court: { select: { id: true, name: true, nameEn: true } },
            teamA: { select: { id: true, teamName: true } },
            teamB: { select: { id: true, teamName: true } },
            winnerTeam: { select: { id: true, teamName: true } },
          },
        },
      },
    });
    if (touchesBracketStructure && hasBracket) {
      const approvedTeams = tournament.teams.filter((team) => team.status === "approved");
      await rebuildPendingGroupStage(tx, tournamentId, approvedTeams, tournament.teamsPerGroup || 4);
    }
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: "updated",
      title: "Tournament settings updated",
      description: "Tournament settings, dates, fees, or court assignments were updated.",
    });
    const autoClosed = await autoCloseTournamentIfFull(tx, tournamentId);
    if (!autoClosed) {
      return;
    }
  });
  return serializeTournament(await getTournamentOrThrow(tournamentId, true), currentUser);
}

async function setTournamentStatus(tournamentId, nextStatus, currentUser) {
  assertManagerOrAdmin(currentUser);
  const existing = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      manager: { select: { id: true, name: true, businessName: true } },
      courts: { include: { court: true } },
      teams: { include: { captain: { select: { id: true, name: true } } } },
      matches: {
        include: {
          court: { select: { id: true, name: true, nameEn: true } },
          teamA: { select: { id: true, teamName: true } },
          teamB: { select: { id: true, teamName: true } },
          winnerTeam: { select: { id: true, teamName: true } },
        },
      },
    },
  });
  assertTournamentAccess(existing, currentUser);
  assertAllowedTournamentTransition(existing, nextStatus);

  const tournament = await prisma.$transaction(async (tx) => {
    if (nextStatus === "cancelled") {
      await releaseTournamentClosures(tx, tournamentId);
    }
    if (nextStatus === "completed") {
      await releaseTournamentMatchClosures(tx, tournamentId);
    }
    const updated = await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: nextStatus },
      include: {
        manager: { select: { id: true, name: true, businessName: true } },
        courts: { include: { court: true } },
        teams: { include: { captain: { select: { id: true, name: true } } } },
        matches: {
          include: {
            court: { select: { id: true, name: true, nameEn: true } },
            teamA: { select: { id: true, teamName: true } },
            teamB: { select: { id: true, teamName: true } },
            winnerTeam: { select: { id: true, teamName: true } },
          },
        },
      },
    });
    const titles = {
      published: "Tournament published",
      registration_open: "Registration opened",
      registration_closed: "Registration closed",
      cancelled: "Tournament cancelled",
      completed: "Tournament completed",
    };
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: nextStatus,
      title: titles[nextStatus] || "Tournament status changed",
      description:
        nextStatus === "registration_closed"
          ? "Registration was closed and the tournament is ready for bracket review."
          : nextStatus === "registration_open"
            ? "Players can now submit team registrations."
            : null,
        metadata: { status: nextStatus },
    });

    await createNotificationsTx(
      tx,
      buildTournamentStatusNotifications(updated, nextStatus, currentUser),
    );
    return updated;
  });

  if (["published", "registration_open", "registration_closed"].includes(nextStatus)) {
    await closeExpiredTournamentRegistrations({ force: true });
    return serializeTournament(await getTournamentOrThrow(tournamentId, true), currentUser);
  }

  return serializeTournament(tournament, currentUser);
}

export const publishTournamentService = (tournamentId, currentUser) => setTournamentStatus(tournamentId, "published", currentUser);
export const openTournamentRegistrationService = (tournamentId, currentUser) => setTournamentStatus(tournamentId, "registration_open", currentUser);
export const closeTournamentRegistrationService = (tournamentId, currentUser) => setTournamentStatus(tournamentId, "registration_closed", currentUser);
export const cancelTournamentService = (tournamentId, currentUser) => setTournamentStatus(tournamentId, "cancelled", currentUser);
export const completeTournamentService = (tournamentId, currentUser) => setTournamentStatus(tournamentId, "completed", currentUser);

export async function registerTournamentTeamService(tournamentId, payload, currentUser) {
  await closeExpiredTournamentRegistrations({ force: true });
  const reusableStatuses = new Set(["withdrawn", "rejected"]);

  const team = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;

    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: { select: { id: true, captainUserId: true, status: true } },
        matches: { select: { id: true } },
      },
    });
    assertTournamentAccess(tournament, currentUser);
    assertBracketNotLocked(tournament, "Tournament registration is locked after the bracket has been generated");
    if (getActiveTeamsCount(tournament) >= tournament.maxTeams) {
      const err = new Error("Tournament is already full");
      err.statusCode = 409;
      throw err;
    }

    if (tournament.status !== "registration_open") {
      const err = new Error("Tournament registration is not open right now");
      err.statusCode = 409;
      throw err;
    }
    if (isRegistrationClosedByTime(tournament)) {
      const err = new Error("Tournament registration has already closed");
      err.statusCode = 409;
      throw err;
    }
    if (hasTournamentStarted(tournament)) {
      const err = new Error("Tournament registration is closed because the tournament has already started");
      err.statusCode = 409;
      throw err;
    }

    const existing = (tournament.teams || []).find((entry) => entry.captainUserId === currentUser.id && !reusableStatuses.has(entry.status));
    if (existing) {
      const err = new Error("You already have a team registration in this tournament");
      err.statusCode = 409;
      throw err;
    }

    const reusableTeam = (tournament.teams || []).find((entry) => entry.captainUserId === currentUser.id && reusableStatuses.has(entry.status));
    const commonData = {
      teamName: payload.teamName.trim(),
      partnerName: payload.partnerName.trim(),
      partnerPhone: payload.partnerPhone ? normalizePhone(payload.partnerPhone) : null,
      notes: payload.notes?.trim() || null,
      status: "pending",
      seed: null,
    };

    const savedTeam = reusableTeam
      ? await tx.tournamentTeam.update({
          where: { id: reusableTeam.id },
          data: commonData,
          include: { captain: { select: { id: true, name: true, phone: true } } },
        })
      : await tx.tournamentTeam.create({
          data: {
            tournamentId,
            captainUserId: currentUser.id,
            ...commonData,
          },
          include: { captain: { select: { id: true, name: true, phone: true } } },
        });

    // Belt-and-suspenders: re-count from DB after write to catch any edge case
    // where a reusable-team resubmission caused the active count to exceed maxTeams.
    if (!reusableTeam) {
      const freshCount = await tx.tournamentTeam.count({
        where: { tournamentId, status: { in: ["pending", "approved"] } },
      });
      if (freshCount > tournament.maxTeams) {
        const err = new Error("Tournament is already full");
        err.statusCode = 409;
        throw err;
      }
    }

    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: reusableTeam ? "team_resubmitted" : "team_registered",
      title: reusableTeam ? "Team registration resubmitted" : "Team registration submitted",
      description: `${savedTeam.teamName} was ${reusableTeam ? "updated and resubmitted" : "submitted"} for manager review.`,
      metadata: {
        teamId: savedTeam.id,
        teamName: savedTeam.teamName,
        status: savedTeam.status,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentRegistrationNotifications(tournament, savedTeam, currentUser),
    );
    await autoCloseTournamentIfFull(tx, tournamentId);
    return savedTeam;
  });

  return serializeTeam(team, currentUser);
}

export async function joinTournamentWaitlistService(tournamentId, payload, currentUser) {
  await closeExpiredTournamentRegistrations({ force: true });
  const reusableStatuses = new Set(["withdrawn", "removed"]);

  const entry = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;

    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: { select: { id: true, captainUserId: true, status: true } },
        waitlistEntries: { select: { id: true, captainUserId: true, status: true } },
        matches: { select: { id: true } },
      },
    });
    assertTournamentAccess(tournament, currentUser);
    assertTournamentWaitlistAvailable(tournament);

    const existingTeam = (tournament.teams || []).find((team) =>
      team.captainUserId === currentUser.id && ["pending", "approved"].includes(team.status),
    );
    if (existingTeam) {
      const err = new Error("You already have an active team registration in this tournament");
      err.statusCode = 409;
      throw err;
    }

    const existingWaitlistEntry = (tournament.waitlistEntries || []).find((item) => item.captainUserId === currentUser.id);
    if (existingWaitlistEntry && !reusableStatuses.has(existingWaitlistEntry.status)) {
      const err = new Error("You already have a waitlist entry in this tournament");
      err.statusCode = 409;
      throw err;
    }

    const commonData = {
      teamName: payload.teamName.trim(),
      partnerName: payload.partnerName.trim(),
      partnerPhone: payload.partnerPhone ? normalizePhone(payload.partnerPhone) : null,
      notes: payload.notes?.trim() || null,
      status: "waiting",
      promotedTeamId: null,
      promotedAt: null,
      removedAt: null,
    };

    const savedEntry = existingWaitlistEntry
      ? await tx.tournamentWaitlistEntry.update({
          where: { id: existingWaitlistEntry.id },
          data: {
            ...commonData,
            createdAt: new Date(),
          },
          include: { captain: { select: { id: true, name: true, phone: true } } },
        })
      : await tx.tournamentWaitlistEntry.create({
          data: {
            tournamentId,
            captainUserId: currentUser.id,
            ...commonData,
          },
          include: { captain: { select: { id: true, name: true, phone: true } } },
        });

    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: existingWaitlistEntry ? "waitlist_resubmitted" : "waitlist_joined",
      title: existingWaitlistEntry ? "Waitlist entry resubmitted" : "Team joined the waitlist",
      description: `${savedEntry.teamName} ${existingWaitlistEntry ? "rejoined" : "joined"} the waitlist for a future opening.`,
      metadata: {
        waitlistEntryId: savedEntry.id,
        teamName: savedEntry.teamName,
        status: savedEntry.status,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentWaitlistJoinedNotifications(tournament, savedEntry, currentUser),
    );

    return savedEntry;
  });

  const position = await prisma.tournamentWaitlistEntry.count({
    where: {
      tournamentId,
      status: "waiting",
      createdAt: {
        lte: entry.createdAt,
      },
    },
  });

  return serializeWaitlistEntry(entry, currentUser, { position });
}

export async function withdrawTournamentWaitlistEntryService(tournamentId, entryId, currentUser) {
  const updated = await prisma.$transaction(async (tx) => {
    const entry = await tx.tournamentWaitlistEntry.findUnique({
      where: { id: entryId },
      include: {
        captain: { select: { id: true, name: true, phone: true } },
        tournament: {
          include: {
            matches: { select: { id: true } },
            teams: { select: { id: true, captainUserId: true, status: true } },
          },
        },
      },
    });

    if (!entry || entry.tournamentId !== tournamentId) {
      const err = new Error("Tournament waitlist entry not found");
      err.statusCode = 404;
      throw err;
    }
    assertBracketNotLocked(entry.tournament, "The waitlist is locked after the bracket has been generated");
    if (["cancelled", "completed"].includes(entry.tournament.status) || hasTournamentStarted(entry.tournament)) {
      const err = new Error("The waitlist can no longer be changed for this tournament");
      err.statusCode = 409;
      throw err;
    }
    if (currentUser.role === "player" && entry.captainUserId !== currentUser.id) {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    assertTournamentAccess(entry.tournament, currentUser);
    if (entry.status !== "waiting") {
      const err = new Error("Only active waitlist entries can be removed");
      err.statusCode = 409;
      throw err;
    }

    const nextStatus = currentUser.role === "player" ? "withdrawn" : "removed";
    const savedEntry = await tx.tournamentWaitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: nextStatus,
        removedAt: new Date(),
      },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });

    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: nextStatus === "withdrawn" ? "waitlist_withdrawn" : "waitlist_removed",
      title: nextStatus === "withdrawn" ? "Waitlist entry withdrawn" : "Waitlist entry removed",
      description:
        nextStatus === "withdrawn"
          ? `${savedEntry.teamName} left the waitlist.`
          : `${savedEntry.teamName} was removed from the waitlist.`,
      metadata: {
        waitlistEntryId: savedEntry.id,
        teamName: savedEntry.teamName,
        status: nextStatus,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentWaitlistRemovedNotifications(entry.tournament, savedEntry, currentUser, nextStatus),
    );

    return savedEntry;
  });

  return {
    entry: serializeWaitlistEntry(updated, currentUser),
    message: updated.status === "withdrawn" ? "Waitlist entry withdrawn" : "Waitlist entry removed",
  };
}

export async function promoteTournamentWaitlistEntryService(tournamentId, entryId, currentUser) {
  assertManagerOrAdmin(currentUser);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    await tx.$executeRaw`SELECT 1 FROM "TournamentWaitlistEntry" WHERE id = ${entryId} FOR UPDATE`;

    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        manager: { select: { id: true, name: true, businessName: true } },
        teams: {
          select: {
            id: true,
            captainUserId: true,
            status: true,
          },
        },
        waitlistEntries: {
          include: {
            captain: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        matches: { select: { id: true } },
      },
    });
    assertTournamentAccess(tournament, currentUser);
    assertBracketNotLocked(tournament, "The waitlist is locked after the bracket has been generated");
    if (["draft", "cancelled", "completed"].includes(tournament.status) || hasTournamentStarted(tournament)) {
      const err = new Error("The waitlist can no longer be changed for this tournament");
      err.statusCode = 409;
      throw err;
    }

    const entry = (tournament.waitlistEntries || []).find((item) => item.id === entryId);
    if (!entry) {
      const err = new Error("Tournament waitlist entry not found");
      err.statusCode = 404;
      throw err;
    }
    if (entry.status !== "waiting") {
      const err = new Error("Only waiting teams can be promoted");
      err.statusCode = 409;
      throw err;
    }
    if (getActiveTeamsCount(tournament) >= tournament.maxTeams) {
      const err = new Error("A waitlist team can only be promoted after a slot becomes available");
      err.statusCode = 409;
      throw err;
    }

    const existingActiveTeam = (tournament.teams || []).find((team) =>
      team.captainUserId === entry.captainUserId && ["pending", "approved"].includes(team.status),
    );
    if (existingActiveTeam) {
      const err = new Error("This player already has an active team registration");
      err.statusCode = 409;
      throw err;
    }

    // Re-verify slot availability with a fresh DB count while the row lock is held.
    // The in-memory check above uses the snapshot loaded at transaction start; this
    // catches any concurrent promotion that committed between that snapshot and now.
    const freshActiveCount = await tx.tournamentTeam.count({
      where: { tournamentId, status: { in: ["pending", "approved"] } },
    });
    if (freshActiveCount >= tournament.maxTeams) {
      const err = new Error("A waitlist team can only be promoted after a slot becomes available");
      err.statusCode = 409;
      throw err;
    }

    const promotedTeam = await tx.tournamentTeam.create({
      data: {
        tournamentId,
        captainUserId: entry.captainUserId,
        teamName: entry.teamName,
        partnerName: entry.partnerName || null,
        partnerPhone: entry.partnerPhone || null,
        notes: entry.notes || null,
        status: "approved",
        seed: null,
      },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });

    const savedEntry = await tx.tournamentWaitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "promoted",
        promotedTeamId: promotedTeam.id,
        promotedAt: new Date(),
        removedAt: null,
      },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });

    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: "waitlist_promoted",
      title: "Waitlist team promoted",
      description: `${promotedTeam.teamName} was promoted from the waitlist into the main bracket pool.`,
      metadata: {
        waitlistEntryId: savedEntry.id,
        teamId: promotedTeam.id,
        teamName: promotedTeam.teamName,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentWaitlistPromotedNotifications(tournament, savedEntry, promotedTeam, currentUser),
    );
    await autoCloseTournamentIfFull(tx, tournamentId);

    return { entry: savedEntry, team: promotedTeam };
  });

  return {
    entry: serializeWaitlistEntry(result.entry, currentUser),
    team: serializeTeam(result.team, currentUser),
    message: "Waitlist team promoted",
  };
}

export async function promoteNextTournamentWaitlistEntryService(tournamentId, currentUser) {
  assertManagerOrAdmin(currentUser);

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      waitlistEntries: {
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  assertTournamentAccess(tournament, currentUser);

  const nextEntry = getNextWaitingWaitlistEntry(tournament);
  if (!nextEntry) {
    const err = new Error("There are no waiting teams to promote right now");
    err.statusCode = 409;
    throw err;
  }

  return promoteTournamentWaitlistEntryService(tournamentId, nextEntry.id, currentUser);
}

export async function withdrawTournamentTeamService(tournamentId, teamId, currentUser) {
  const updated = await prisma.$transaction(async (tx) => {
    const team = await tx.tournamentTeam.findUnique({
      where: { id: teamId },
      include: {
        tournament: {
          include: {
            manager: { select: { id: true, name: true, businessName: true } },
            matches: { select: { id: true } },
            teams: { select: { id: true, status: true } },
            waitlistEntries: {
              include: {
                captain: { select: { id: true, name: true, phone: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        captain: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!team || team.tournamentId !== tournamentId) {
      const err = new Error("Tournament team not found");
      err.statusCode = 404;
      throw err;
    }
    if (currentUser.role === "player" && team.captainUserId !== currentUser.id) {
      const err = new Error("Only the team captain can withdraw this team");
      err.statusCode = 403;
      throw err;
    }
    if (team.tournament.status !== "registration_open" || isRegistrationClosedByTime(team.tournament) || hasTournamentStarted(team.tournament)) {
      const err = new Error("Registration cannot be withdrawn after registration has closed or the tournament has started");
      err.statusCode = 409;
      throw err;
    }
    assertBracketNotLocked(team.tournament, "Registration cannot be withdrawn after the bracket has been generated");
    if (["admin", "manager"].includes(currentUser.role)) {
      assertTournamentAccess(team.tournament, currentUser);
    }
    const wasFullBeforeWithdrawal = getActiveTeamsCount(team.tournament) >= team.tournament.maxTeams;
    const savedTeam = await tx.tournamentTeam.update({
      where: { id: team.id },
      data: { status: "withdrawn" },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: "team_withdrawn",
      title: "Team registration withdrawn",
      description: `${savedTeam.teamName} was withdrawn before bracket generation.`,
      metadata: {
        teamId: savedTeam.id,
        teamName: savedTeam.teamName,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentWithdrawalNotifications(team.tournament, savedTeam, currentUser),
    );
    if (wasFullBeforeWithdrawal) {
      const nextEntry = getNextWaitingWaitlistEntry(team.tournament);
      if (nextEntry) {
        await logTournamentActivity(tx, {
          tournamentId,
          actorUserId: currentUser.id,
          action: "waitlist_slot_opened",
          title: "A tournament slot opened",
          description: `${nextEntry.teamName} is now next in line after a team withdrew.`,
          metadata: {
            teamId: savedTeam.id,
            teamName: savedTeam.teamName,
            waitlistEntryId: nextEntry.id,
            nextTeamName: nextEntry.teamName,
          },
        });
        await createNotificationsTx(
          tx,
          buildTournamentWaitlistSpotOpenedNotifications(team.tournament, nextEntry, currentUser),
        );
      }
    }
    return savedTeam;
  });
  return { team: serializeTeam(updated, currentUser), message: "Tournament registration withdrawn" };
}

async function updateTeamStatus(tournamentId, teamId, status, payload, currentUser) {
  assertManagerOrAdmin(currentUser);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    await tx.$executeRaw`SELECT 1 FROM "TournamentTeam" WHERE id = ${teamId} FOR UPDATE`;

    const team = await tx.tournamentTeam.findUnique({
      where: { id: teamId },
      include: {
        captain: { select: { id: true, name: true, phone: true } },
        tournament: {
          include: {
            manager: { select: { id: true, name: true, businessName: true } },
            matches: { select: { id: true } },
            teams: { select: { id: true, status: true } },
            waitlistEntries: {
              include: {
                captain: { select: { id: true, name: true, phone: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
    if (!team || team.tournamentId !== tournamentId) {
      const err = new Error("Tournament team not found");
      err.statusCode = 404;
      throw err;
    }
    assertTournamentAccess(team.tournament, currentUser);
    assertTournamentCanReviewTeams(team.tournament);
    if (team.status === "withdrawn") {
      const err = new Error("Withdrawn teams must re-register instead of being approved directly");
      err.statusCode = 409;
      throw err;
    }

    const activeStatuses = new Set(["pending", "approved"]);
    const isActivatingTeam = activeStatuses.has(status) && !activeStatuses.has(team.status);
    const activeTeamsCount = (team.tournament.teams || []).filter((item) => activeStatuses.has(item.status)).length;
    const opensTournamentSpot = activeStatuses.has(team.status) && !activeStatuses.has(status) && activeTeamsCount >= team.tournament.maxTeams;
    if (isActivatingTeam && activeTeamsCount >= team.tournament.maxTeams) {
      const err = new Error("The tournament is already at maximum active team capacity");
      err.statusCode = 409;
      throw err;
    }

    const savedTeam = await tx.tournamentTeam.update({
      where: { id: team.id },
      data: { status, ...(payload?.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}) },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: status === "approved" ? "team_approved" : "team_rejected",
      title: status === "approved" ? "Team approved" : "Team rejected",
      description:
        status === "approved"
          ? `${savedTeam.teamName} was approved for tournament play.`
          : `${savedTeam.teamName} was rejected during tournament review.`,
      metadata: {
        teamId: savedTeam.id,
        teamName: savedTeam.teamName,
        status,
        notes: payload?.notes?.trim() || null,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentReviewNotifications(
        team.tournament,
        [savedTeam],
        status,
        payload?.notes,
        currentUser,
      ),
    );
    if (opensTournamentSpot) {
      const nextEntry = getNextWaitingWaitlistEntry(team.tournament);
      if (nextEntry) {
        await logTournamentActivity(tx, {
          tournamentId,
          actorUserId: currentUser.id,
          action: "waitlist_slot_opened",
          title: "A tournament slot opened",
          description: `${nextEntry.teamName} is now next in line after a review decision freed up a slot.`,
          metadata: {
            teamId: savedTeam.id,
            teamName: savedTeam.teamName,
            waitlistEntryId: nextEntry.id,
            nextTeamName: nextEntry.teamName,
          },
        });
        await createNotificationsTx(
          tx,
          buildTournamentWaitlistSpotOpenedNotifications(team.tournament, nextEntry, currentUser),
        );
      }
    }
    await autoCloseTournamentIfFull(tx, tournamentId);
    return savedTeam;
  });

  return serializeTeam(updated, currentUser);
}

export const approveTournamentTeamService = (tournamentId, teamId, payload, currentUser) => updateTeamStatus(tournamentId, teamId, "approved", payload, currentUser);
export const rejectTournamentTeamService = (tournamentId, teamId, payload, currentUser) => updateTeamStatus(tournamentId, teamId, "rejected", payload, currentUser);

export async function bulkReviewTournamentTeamsService(tournamentId, payload, currentUser) {
  assertManagerOrAdmin(currentUser);
  const uniqueTeamIds = [...new Set((payload?.teamIds || []).filter(Boolean))];

  const updatedTeams = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;

    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        matches: { select: { id: true } },
        teams: { select: { id: true, status: true } },
      },
    });
    assertTournamentAccess(tournament, currentUser);
    assertTournamentCanReviewTeams(tournament);

    const teams = await tx.tournamentTeam.findMany({
      where: {
        tournamentId,
        id: { in: uniqueTeamIds },
      },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });

    if (teams.length !== uniqueTeamIds.length) {
      const err = new Error("One or more tournament teams were not found");
      err.statusCode = 404;
      throw err;
    }
    if (teams.some((team) => team.status === "rejected")) {
      const err = new Error("Rejected teams cannot be bulk-reviewed — a rejected team must re-register first");
      err.statusCode = 409;
      throw err;
    }
    if (teams.some((team) => team.status === "withdrawn")) {
      const err = new Error("Withdrawn teams must re-register instead of being reviewed in bulk");
      err.statusCode = 409;
      throw err;
    }
    if (teams.some((team) => team.status !== "pending")) {
      const err = new Error("Bulk review only supports teams that are still pending");
      err.statusCode = 409;
      throw err;
    }

    const normalizedNotes = payload?.notes !== undefined ? payload.notes?.trim() || null : null;
    await tx.tournamentTeam.updateMany({
      where: { id: { in: uniqueTeamIds } },
      data: {
        status: payload.status,
        ...(payload?.notes !== undefined ? { notes: normalizedNotes } : {}),
      },
    });

    const refreshedTeams = await tx.tournamentTeam.findMany({
      where: { id: { in: uniqueTeamIds } },
      include: { captain: { select: { id: true, name: true, phone: true } } },
    });
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: payload.status === "approved" ? "teams_bulk_approved" : "teams_bulk_rejected",
      title: payload.status === "approved" ? "Teams approved in bulk" : "Teams rejected in bulk",
      description: `${refreshedTeams.length} team registration${refreshedTeams.length > 1 ? "s were" : " was"} ${payload.status} together.`,
      metadata: {
        teamIds: refreshedTeams.map((team) => team.id),
        teamNames: refreshedTeams.map((team) => team.teamName),
        count: refreshedTeams.length,
        status: payload.status,
        notes: normalizedNotes,
      },
    });
    await createNotificationsTx(
      tx,
      buildTournamentReviewNotifications(
        tournament,
        refreshedTeams,
        payload.status,
        normalizedNotes,
        currentUser,
      ),
    );
    await autoCloseTournamentIfFull(tx, tournamentId);
    return refreshedTeams;
  });

  return updatedTeams.map((team) => serializeTeam(team, currentUser));
}


function normalizeImportRow(row = {}) {
  const teamName = String(row.teamName || row.team || "").trim();
  const partnerName = String(row.partnerName || row.partner || "").trim();
  const partnerPhone = row.partnerPhone ? normalizePhone(row.partnerPhone) : null;
  const captainUserId = String(row.captainUserId || row.userId || "").trim() || null;
  const captainEmail = String(row.captainEmail || row.email || "").trim().toLowerCase() || null;
  const captainPhone = row.captainPhone ? normalizePhone(row.captainPhone) : null;
  const captainName = String(row.captainName || row.captain || row.playerName || "").trim() || null;
  const notes = String(row.notes || "").trim() || null;
  const status = row.status === "approved" ? "approved" : "pending";
  return { teamName, partnerName, partnerPhone, captainUserId, captainEmail, captainPhone, captainName, notes, status };
}

function buildTournamentImportNotifications(tournament, teams, currentUser) {
  const title = tournament.title;
  const titleAr = tournament.titleAr || tournament.title;
  return teams.map((team) => ({
    userId: team.captainUserId,
    actorUserId: currentUser.id,
    type: team.status === "approved" ? "success" : "info",
    priority: "normal",
    category: "tournament",
    eventKey: "tournament_team_imported",
    title: team.status === "approved" ? "Team added to tournament" : "Team imported for review",
    titleAr: team.status === "approved" ? "تمت إضافة فريقك للبطولة" : "تم استيراد فريقك للمراجعة",
    message: `${team.teamName} was imported into ${title}${team.status === "approved" ? " as an approved team" : " and is pending manager review"}.`,
    messageAr: `تم استيراد فريق ${team.teamName} في ${titleAr}${team.status === "approved" ? " كفريق معتمد" : " وهو بانتظار المراجعة"}.`,
    link: `/dashboard/player/tournaments/${tournament.id}`,
    metadata: { tournamentId: tournament.id, teamId: team.id, status: team.status },
  }));
}

export async function importTournamentTeamsService(tournamentId, payload = {}, currentUser) {
  await closeExpiredTournamentRegistrations({ force: true });
  assertManagerOrAdmin(currentUser);
  const rows = Array.isArray(payload.teams) ? payload.teams.map(normalizeImportRow) : [];
  if (!rows.length) {
    const err = new Error("At least one team row is required for import");
    err.statusCode = 400;
    throw err;
  }

  // Reject the entire batch early if any two rows share the same captain identifier.
  // The per-row loop also catches this, but failing fast here gives a clearer error
  // before any DB work starts.
  const batchKeys = new Set();
  for (const [index, row] of rows.entries()) {
    const key = row.captainUserId || row.captainEmail || row.captainPhone || row.captainName || null;
    if (key) {
      if (batchKeys.has(key)) {
        const err = new Error(`Row ${index + 1}: duplicate captain — each captain can appear only once per import batch`);
        err.statusCode = 400;
        throw err;
      }
      batchKeys.add(key);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        manager: { select: { id: true, name: true, businessName: true } },
        teams: { select: { id: true, captainUserId: true, status: true } },
        waitlistEntries: { select: { id: true, captainUserId: true, status: true } },
        matches: { select: { id: true } },
      },
    });
    assertTournamentAccess(tournament, currentUser);
    assertBracketNotLocked(tournament, "Teams cannot be imported after the bracket has been generated");
    if (!["registration_open", "registration_closed"].includes(tournament.status)) {
      const err = new Error("Teams can only be imported after registration opens, and after it closes until the bracket is generated");
      err.statusCode = 409;
      throw err;
    }
    if (["cancelled", "completed"].includes(tournament.status) || hasTournamentStarted(tournament)) {
      const err = new Error("Teams can only be imported before tournament play starts");
      err.statusCode = 409;
      throw err;
    }

    const imported = [];
    const waitlisted = [];
    const failed = [];
    const activeCaptainIds = new Set((tournament.teams || []).filter((team) => ["pending", "approved"].includes(team.status)).map((team) => team.captainUserId));
    const waitingCaptainIds = new Set((tournament.waitlistEntries || []).filter((entry) => entry.status === "waiting").map((entry) => entry.captainUserId));
    const reusableTeamsByCaptainId = new Map((tournament.teams || []).filter((team) => ["rejected", "withdrawn"].includes(team.status)).map((team) => [team.captainUserId, team]));
    const reusableWaitlistByCaptainId = new Map((tournament.waitlistEntries || []).filter((entry) => ["removed", "withdrawn"].includes(entry.status)).map((entry) => [entry.captainUserId, entry]));
    let activeCount = getActiveTeamsCount(tournament);

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 1;
      try {
        if (!row.teamName || !row.partnerName) {
          throw new Error("Team name and partner name are required");
        }
        const userWhere = row.captainUserId
          ? { id: row.captainUserId }
          : row.captainEmail
            ? { email: row.captainEmail }
            : row.captainPhone
              ? { phone: row.captainPhone }
              : null;
        if (!userWhere && !row.captainName) {
          throw new Error("Captain user id, email, phone, or exact account name is required");
        }

        let captain = null;
        if (userWhere) {
          captain = await tx.user.findUnique({
            where: userWhere,
            select: { id: true, name: true, email: true, phone: true, role: true, deletedAt: true, isActive: true },
          });
        } else if (row.captainName) {
          const matchingCaptains = await tx.user.findMany({
            where: {
              name: { equals: row.captainName, mode: "insensitive" },
              role: "player",
              deletedAt: null,
              isActive: true,
            },
            select: { id: true, name: true, email: true, phone: true, role: true, deletedAt: true, isActive: true },
            take: 2,
          });
          if (matchingCaptains.length > 1) {
            throw new Error("Multiple captain accounts matched this name; use email or phone instead");
          }
          captain = matchingCaptains[0] || null;
        }

        if (!captain) {
          throw new Error(row.captainName ? "Captain account was not found by name" : "Captain account was not found");
        }
        if (captain.role !== "player" || captain.deletedAt || captain.isActive === false) {
          throw new Error("Captain must be an active player account");
        }
        if (activeCaptainIds.has(captain.id) || waitingCaptainIds.has(captain.id)) {
          throw new Error("Captain already has an active registration or waitlist entry");
        }

        if (activeCount >= tournament.maxTeams || payload.mode === "waitlist") {
          const reusableEntry = reusableWaitlistByCaptainId.get(captain.id);
          const entry = reusableEntry
            ? await tx.tournamentWaitlistEntry.update({
                where: { id: reusableEntry.id },
                data: {
                  teamName: row.teamName,
                  partnerName: row.partnerName,
                  partnerPhone: row.partnerPhone,
                  notes: row.notes,
                  status: "waiting",
                  promotedTeamId: null,
                  promotedAt: null,
                  removedAt: null,
                  createdAt: new Date(),
                },
                include: { captain: { select: { id: true, name: true, phone: true } } },
              })
            : await tx.tournamentWaitlistEntry.create({
                data: {
                  tournamentId,
                  captainUserId: captain.id,
                  teamName: row.teamName,
                  partnerName: row.partnerName,
                  partnerPhone: row.partnerPhone,
                  notes: row.notes,
                  status: "waiting",
                },
                include: { captain: { select: { id: true, name: true, phone: true } } },
              });
          waitingCaptainIds.add(captain.id);
          reusableWaitlistByCaptainId.delete(captain.id);
          waitlisted.push(entry);
        } else {
          const reusableTeam = reusableTeamsByCaptainId.get(captain.id);
          const team = reusableTeam
            ? await tx.tournamentTeam.update({
                where: { id: reusableTeam.id },
                data: {
                  teamName: row.teamName,
                  partnerName: row.partnerName,
                  partnerPhone: row.partnerPhone,
                  notes: row.notes,
                  status: row.status,
                  seed: null,
                  groupId: null,
                },
                include: { captain: { select: { id: true, name: true, phone: true } } },
              })
            : await tx.tournamentTeam.create({
                data: {
                  tournamentId,
                  captainUserId: captain.id,
                  teamName: row.teamName,
                  partnerName: row.partnerName,
                  partnerPhone: row.partnerPhone,
                  notes: row.notes,
                  status: row.status,
                  seed: null,
                },
                include: { captain: { select: { id: true, name: true, phone: true } } },
              });
          activeCaptainIds.add(captain.id);
          reusableTeamsByCaptainId.delete(captain.id);
          activeCount += ["pending", "approved"].includes(team.status) ? 1 : 0;
          imported.push(team);
        }
      } catch (error) {
        failed.push({ rowNumber, teamName: row.teamName || null, reason: error?.message || "Import failed" });
      }
    }

    if (imported.length || waitlisted.length) {
      await logTournamentActivity(tx, {
        tournamentId,
        actorUserId: currentUser.id,
        action: "teams_imported",
        title: "Teams imported",
        description: `${imported.length} team${imported.length === 1 ? "" : "s"} imported and ${waitlisted.length} moved to waitlist.`,
        metadata: { imported: imported.length, waitlisted: waitlisted.length, failed: failed.length },
      });
      await createNotificationsTx(tx, buildTournamentImportNotifications(tournament, imported, currentUser));
      await autoCloseTournamentIfFull(tx, tournamentId);
    }

    return { imported, waitlisted, failed };
  });

  return {
    imported: result.imported.map((team) => serializeTeam(team, currentUser)),
    waitlisted: result.waitlisted.map((entry) => serializeWaitlistEntry(entry, currentUser)),
    failed: result.failed,
  };
}

export async function previewTournamentDrawService(tournamentId, currentUser, query = {}) {
  await closeExpiredTournamentRegistrations({ force: true });
  assertManagerOrAdmin(currentUser);
  assertValidDrawSeed(query.drawSeed);

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { include: { captain: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      matches: { select: { id: true, status: true } },
      manager: { select: { id: true, name: true, businessName: true } },
    },
  });
  // assertTournamentAccess throws 404 when tournament is null and 403 when the
  // manager does not own it — the explicit null check below was dead code.
  assertTournamentAccess(tournament, currentUser);

  if (tournament.matches?.some((match) => match.status === "scheduled" || match.status === "completed")) {
    const err = new Error("Draw preview is locked because match play has started");
    err.statusCode = 409;
    throw err;
  }
  const approvedTeams = (tournament.teams || []).filter((team) => team.status === "approved");
  if (approvedTeams.length < 2) {
    const err = new Error("At least two approved teams are required to preview the draw");
    err.statusCode = 409;
    throw err;
  }
  const seed = normalizeDrawSeed(query.drawSeed || `draw-${Date.now()}`);
  return buildTournamentDrawPreview(approvedTeams, tournament.teamsPerGroup || 4, seed);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function roundUpToNextSlot(date, slotMinutes = 30) {
  const ms = slotMinutes * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

export async function autoScheduleTournamentMatchesService(tournamentId, payload = {}, currentUser) {
  assertManagerOrAdmin(currentUser);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      manager: { select: { id: true, name: true, businessName: true } },
      courts: { include: { court: true } },
      matches: {
        where: { teamAId: { not: null }, teamBId: { not: null }, status: "pending" },
        orderBy: [{ stage: "asc" }, { roundNumber: "asc" }, { matchNumber: "asc" }],
        select: { id: true, stage: true, roundNumber: true, matchNumber: true },
      },
    },
  });
  assertTournamentAccess(tournament, currentUser);
  assertTournamentEditableForMatches(tournament, "Auto scheduling matches");
  const tournamentCourts = (tournament.courts || []).map((item) => item.court).filter(Boolean);
  const selectedCourtIds = Array.isArray(payload.courtIds) && payload.courtIds.length ? new Set(payload.courtIds) : null;
  const courts = selectedCourtIds ? tournamentCourts.filter((court) => selectedCourtIds.has(court.id)) : tournamentCourts;
  if (!courts.length) {
    const err = new Error("At least one tournament court is required for auto scheduling");
    err.statusCode = 400;
    throw err;
  }
  const durationMinutes = Math.min(240, Math.max(30, Number(payload.durationMinutes) || 60));
  const gapMinutes = Math.min(120, Math.max(0, Number(payload.gapMinutes) || 15));
  const startAt = payload.startAt
    ? new Date(payload.startAt)
    : roundUpToNextSlot(new Date(Math.max(Date.now() + 30 * 60 * 1000, toMs(tournament.startDate) || 0)), 30);
  const scheduled = [];
  const skipped = [];
  let cursor = startAt;

  for (const match of tournament.matches || []) {
    let placed = false;
    let candidate = cursor;
    let firstReason = null;
    for (let attempt = 0; attempt < 24 * 45 && !placed; attempt += 1) {
      for (const court of courts) {
        const candidateEnd = addMinutes(candidate, durationMinutes);
        try {
          const scheduledMatch = await scheduleTournamentMatchService(
            tournamentId,
            match.id,
            { courtId: court.id, startAt: candidate.toISOString(), endAt: candidateEnd.toISOString() },
            currentUser,
          );
          scheduled.push(scheduledMatch);
          cursor = addMinutes(candidateEnd, gapMinutes);
          placed = true;
          break;
        } catch (error) {
          if (![400, 409].includes(error?.statusCode)) throw error;
          firstReason ||= error?.message || "No available slot was found for this match";
        }
      }
      if (!placed) candidate = addMinutes(candidate, 30);
    }
    if (!placed) {
      skipped.push({
        matchId: match.id,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        reason: firstReason || "No available court slot was found in the search window",
      });
    }
  }

  return {
    scheduledCount: scheduled.length,
    skipped,
    tournament: serializeTournament(await getTournamentOrThrow(tournamentId, true), currentUser),
  };
}

export async function generateTournamentBracketService(tournamentId, currentUser, payload = {}) {
  await closeExpiredTournamentRegistrations({ force: true });
  assertManagerOrAdmin(currentUser);
  assertValidDrawSeed(payload.drawSeed);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { orderBy: { createdAt: "asc" } },
      matches: { select: { id: true, status: true, closureId: true } },
      manager: { select: { id: true, name: true, businessName: true } },
      courts: { include: { court: true } },
    },
  });
  assertTournamentAccess(tournament, currentUser);
  if (!["registration_open", "registration_closed"].includes(tournament.status)) {
    const err = new Error("Bracket can only be generated after registration is closed");
    err.statusCode = 409;
    throw err;
  }
  const approvedTeams = tournament.teams.filter((team) => team.status === "approved");
  if (approvedTeams.length < 2) {
    const err = new Error("At least two approved teams are required to generate the bracket");
    err.statusCode = 409;
    throw err;
  }
  const pendingTeams = tournament.teams.filter((team) => team.status === "pending");
  if (pendingTeams.length > 0) {
    const err = new Error("Resolve all pending team registrations before generating the bracket");
    err.statusCode = 409;
    throw err;
  }
  if (tournament.matches.length > 0) {
    const err = new Error("Bracket has already been generated for this tournament");
    err.statusCode = 409;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    const blueprint = await rebuildPendingGroupStage(
      tx,
      tournamentId,
      approvedTeams,
      tournament.teamsPerGroup || 4,
      { drawSeed: payload.drawSeed, drawGroups: payload.drawGroups },
    );
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "registration_closed" } });
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: "bracket_generated",
      title: "Bracket generated",
      description: `A bracket was generated from ${approvedTeams.length} approved teams.`,
      metadata: {
        approvedTeams: approvedTeams.length,
        totalMatches: blueprint.matches.length,
        drawSeed: payload.drawSeed || null,
        manualDraw: Array.isArray(payload.drawGroups) && payload.drawGroups.length > 0,
      },
    });
    await createNotificationsTx(
      tx,
      buildBracketGeneratedNotifications(tournament, approvedTeams, currentUser),
    );
  });

  return serializeTournament(await getTournamentOrThrow(tournamentId, true), currentUser);
}

async function lockCourt(tx, courtId) {
  await tx.$executeRaw`SELECT 1 FROM "Court" WHERE id = ${courtId} FOR UPDATE`;
}

function assertCourtCanHostMatch(court, startAt, endAt) {
  if (!court) {
    const err = new Error("Court not found");
    err.statusCode = 404;
    throw err;
  }
  if (court.status !== "active") {
    const err = new Error("Selected court is not active for tournament scheduling");
    err.statusCode = 409;
    throw err;
  }
  if (!(startAt instanceof Date) || !(endAt instanceof Date) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt.getTime() <= startAt.getTime()) {
    const err = new Error("Invalid match schedule window");
    err.statusCode = 400;
    throw err;
  }

  const openStr = court.openTime || "08:00";
  const closeStr = court.closeTime || "23:59";
  if (timeToMinutes(openStr) === timeToMinutes(closeStr)) {
    const durationMs = endAt.getTime() - startAt.getTime();
    if (durationMs > 24 * 60 * 60 * 1000) {
      const err = new Error("Match schedule cannot exceed 24 hours on a 24-hour court");
      err.statusCode = 409;
      throw err;
    }
    return;
  }
  const anchors = [
    formatDateOnlyCairo(startAt),
    formatDateOnlyCairo(new Date(startAt.getTime() - 24 * 60 * 60 * 1000)),
  ];
  const fitsWithinSession = anchors.some((anchorDate) => {
    const session = getAbsoluteSessionTimes(anchorDate, openStr, closeStr);
    return startAt.getTime() >= session.sessionStartMs && endAt.getTime() <= session.sessionEndMs;
  });

  if (!fitsWithinSession) {
    const err = new Error(`The selected match window is outside the court operating hours of ${openStr} to ${closeStr}.`);
    err.statusCode = 409;
    throw err;
  }
}

async function assertMatchWindowClear({ tx, court, startAt, endAt, ignoreClosureId }) {
  const overlappingClosure = await tx.courtClosure.findFirst({
    where: {
      courtId: court.id,
      ...(ignoreClosureId ? { id: { not: ignoreClosureId } } : {}),
      startDate: { lt: endAt },
      endDate: { gt: startAt },
    },
    select: { id: true },
  });
  if (overlappingClosure) {
    const err = new Error("This match conflicts with another closure on the selected court");
    err.statusCode = 409;
    throw err;
  }

  const fromDate = formatDateOnlyCairo(new Date(startAt.getTime() - 24 * 60 * 60 * 1000));
  const toDate = formatDateOnlyCairo(new Date(endAt.getTime() + 24 * 60 * 60 * 1000));
  const overlappingBookings = await tx.booking.findMany({
    where: { courtId: court.id, status: { in: ["pending", "confirmed", "completed"] }, date: { gte: fromDate, lte: toDate } },
    select: { id: true, date: true, startTime: true, endTime: true, sessionOpenTime: true },
  });
  const hasBookingConflict = overlappingBookings.some((booking) => {
    const times = getAbsoluteBookingTimes(booking.date, booking.startTime, booking.endTime, booking.sessionOpenTime || court.openTime || "08:00");
    return startAt.getTime() < times.endMs && times.startMs < endAt.getTime();
  });
  if (hasBookingConflict) {
    const err = new Error("This match cannot be scheduled because there are player bookings in this time interval. Please reschedule or cancel those bookings first.");
    err.statusCode = 409;
    throw err;
  }
}

async function lockRelatedTournamentMatches(tx, tournamentId, matchId, teamIds) {
  const [teamAId, teamBId] = teamIds;
  await tx.$executeRaw`
    SELECT 1
    FROM "TournamentMatch"
    WHERE "tournamentId" = ${tournamentId}
      AND id <> ${matchId}
      AND (
        "teamAId" = ${teamAId}
        OR "teamBId" = ${teamAId}
        OR "teamAId" = ${teamBId}
        OR "teamBId" = ${teamBId}
      )
    FOR UPDATE
  `;
}

async function assertTeamsNotDoubleBooked({ tx, tournamentId, matchId, teamIds, startAt, endAt }) {
  const [teamAId, teamBId] = teamIds;
  const overlappingTeamMatch = await tx.tournamentMatch.findFirst({
    where: {
      tournamentId,
      id: { not: matchId },
      status: "scheduled",
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      OR: [
        { teamAId: { in: [teamAId, teamBId] } },
        { teamBId: { in: [teamAId, teamBId] } },
      ],
    },
    select: { id: true },
  });
  if (overlappingTeamMatch) {
    const err = new Error("One of the selected teams already has another scheduled match that overlaps this time window");
    err.statusCode = 409;
    throw err;
  }
}


function buildMatchReminderNotifications(tournament, match, currentUser) {
  const recipients = [match.teamA, match.teamB].filter((team) => team?.captainUserId);
  const courtName = match.court?.nameEn || match.court?.name || "the assigned court";
  const title = tournament.title;
  const titleAr = tournament.titleAr || tournament.title;
  return recipients.map((team) => ({
    userId: team.captainUserId,
    actorUserId: currentUser.id,
    type: "info",
    priority: "high",
    category: "tournament",
    eventKey: "tournament_match_reminder",
    title: "Tournament match reminder",
    titleAr: "تذكير بمباراة البطولة",
    message: `${team.teamName} has a match in ${title} at ${formatDateValue(match.startAt)} on ${courtName}.`,
    messageAr: `لدى ${team.teamName} مباراة في ${titleAr} بتاريخ ${formatDateValue(match.startAt)} على ${courtName}.`,
    link: `/dashboard/player/tournaments/${tournament.id}`,
    metadata: { tournamentId: tournament.id, matchId: match.id, startAt: formatDateValue(match.startAt), courtName },
  }));
}

export async function sendTournamentMatchReminderService(tournamentId, matchId, currentUser) {
  assertManagerOrAdmin(currentUser);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      manager: { select: { id: true, name: true, businessName: true } },
      matches: {
        where: { id: matchId },
        include: {
          court: { select: { id: true, name: true, nameEn: true } },
          teamA: { select: { id: true, teamName: true, captainUserId: true } },
          teamB: { select: { id: true, teamName: true, captainUserId: true } },
          winnerTeam: { select: { id: true, teamName: true } },
        },
      },
    },
  });
  assertTournamentAccess(tournament, currentUser);
  const match = tournament?.matches?.[0];
  if (!match) {
    const err = new Error("Tournament match not found");
    err.statusCode = 404;
    throw err;
  }
  if (match.status !== "scheduled") {
    const err = new Error("Reminders can only be sent for scheduled matches");
    err.statusCode = 409;
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: "match_reminder_sent",
      title: "Match reminder sent",
      description: `Reminder sent for ${match.teamA?.teamName || "Team A"} vs ${match.teamB?.teamName || "Team B"}.`,
      metadata: { matchId, startAt: formatDateValue(match.startAt), courtId: match.courtId },
    });
    await createNotificationsTx(tx, buildMatchReminderNotifications(tournament, match, currentUser));
  });

  return { success: true, match: serializeMatch(match) };
}

export async function scheduleTournamentMatchService(tournamentId, matchId, payload, currentUser) {
  assertManagerOrAdmin(currentUser);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { manager: { select: { id: true, name: true, businessName: true } }, courts: { include: { court: true } }, teams: { select: { id: true, teamName: true, captainUserId: true } }, matches: { select: { id: true } } } });
  assertTournamentAccess(tournament, currentUser);
  assertTournamentEditableForMatches(tournament, "Scheduling matches");
  const allowedCourtIds = new Set((tournament.courts || []).map((item) => item.courtId));
  if (!allowedCourtIds.has(payload.courtId)) {
    const err = new Error("Selected court is not assigned to this tournament");
    err.statusCode = 400;
    throw err;
  }
  const court = await prisma.court.findUnique({ where: { id: payload.courtId }, select: { id: true, managerId: true, openTime: true, closeTime: true, status: true, name: true, nameEn: true } });
  if (!court) {
    const err = new Error("Court not found");
    err.statusCode = 404;
    throw err;
  }
  if (currentUser.role === "manager" && court.managerId !== currentUser.id) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);
  assertCourtCanHostMatch(court, startAt, endAt);
  const tournamentStartMs = toMs(tournament.startDate);
  const tournamentEndMs = toMs(tournament.endDate);
  if (tournamentStartMs != null && startAt.getTime() < tournamentStartMs) {
    const err = new Error("Match start time cannot be before the tournament start date");
    err.statusCode = 409;
    throw err;
  }
  if (tournamentEndMs != null && endAt.getTime() > tournamentEndMs) {
    const err = new Error("Match end time cannot be after the tournament end date");
    err.statusCode = 409;
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!existing || existing.tournamentId !== tournamentId) {
      const err = new Error("Tournament match not found");
      err.statusCode = 404;
      throw err;
    }
    if (!existing.teamAId || !existing.teamBId) {
      const err = new Error("This match cannot be scheduled until both teams are known");
      err.statusCode = 409;
      throw err;
    }
    if (["completed", "cancelled"].includes(existing.status)) {
      const err = new Error(`${existing.status === "completed" ? "Completed" : "Cancelled"} matches cannot be rescheduled`);
      err.statusCode = 409;
      throw err;
    }
    await lockCourt(tx, court.id);
    if (existing.courtId && existing.courtId !== court.id) await lockCourt(tx, existing.courtId);
    await lockRelatedTournamentMatches(tx, tournamentId, existing.id, [existing.teamAId, existing.teamBId]);
    await assertTeamsNotDoubleBooked({ tx, tournamentId, matchId: existing.id, teamIds: [existing.teamAId, existing.teamBId], startAt, endAt });
    await assertMatchWindowClear({ tx, court, startAt, endAt, ignoreClosureId: existing.courtId === court.id ? existing.closureId : undefined });

    let closureId = existing.closureId || null;
    const reason = `Tournament match - ${tournament.title} (Round ${existing.roundNumber})`;
    if (existing.closureId && existing.courtId === court.id) {
      await tx.courtClosure.update({ where: { id: existing.closureId }, data: { startDate: startAt, endDate: endAt, reason } });
    } else {
      const createdClosure = await tx.courtClosure.create({ data: { courtId: court.id, startDate: startAt, endDate: endAt, reason } });
      closureId = createdClosure.id;
      if (existing.closureId) await tx.courtClosure.delete({ where: { id: existing.closureId } });
    }
    const match = await tx.tournamentMatch.update({
      where: { id: existing.id },
      data: { courtId: court.id, startAt, endAt, closureId, status: "scheduled" },
      include: {
        court: { select: { id: true, name: true, nameEn: true } },
        teamA: { select: { id: true, teamName: true, captainUserId: true } },
        teamB: { select: { id: true, teamName: true, captainUserId: true } },
        winnerTeam: { select: { id: true, teamName: true } },
      },
    });
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: existing.courtId || existing.startAt || existing.endAt ? "match_rescheduled" : "match_scheduled",
      title: existing.courtId || existing.startAt || existing.endAt ? "Match rescheduled" : "Match scheduled",
      description: `${match.teamA?.teamName || "TBD"} vs ${match.teamB?.teamName || "TBD"} was scheduled on ${court.nameEn || court.name || "the selected court"}.`,
      metadata: {
        matchId: match.id,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        courtId: court.id,
        courtName: court.nameEn || court.name || null,
        startAt: formatDateValue(startAt),
        endAt: formatDateValue(endAt),
      },
    });
    await createNotificationsTx(
      tx,
      buildMatchScheduledNotifications(
        tournament,
        match,
        currentUser,
        { rescheduled: Boolean(existing.courtId || existing.startAt || existing.endAt) },
      ),
    );
    await syncTournamentLifecycleStatus(tx, tournamentId);
    return match;
  });
  return serializeMatch(updated);
}

export async function checkInTournamentMatchTeamService(tournamentId, matchId, payload, currentUser) {
  assertManagerOrAdmin(currentUser);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      manager: { select: { id: true, name: true, businessName: true } },
      courts: { include: { court: true } },
      matches: { select: { id: true } },
    },
  });
  assertTournamentAccess(tournament, currentUser);
  assertTournamentEditableForMatches(tournament, "Match check-in");

  const updated = await prisma.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUnique({
      where: { id: matchId },
      include: {
        court: { select: { id: true, name: true, nameEn: true } },
        teamA: { select: { id: true, teamName: true } },
        teamB: { select: { id: true, teamName: true } },
        winnerTeam: { select: { id: true, teamName: true } },
      },
    });

    if (!match || match.tournamentId !== tournamentId) {
      const err = new Error("Tournament match not found");
      err.statusCode = 404;
      throw err;
    }
    if (match.status !== "scheduled") {
      const err = new Error("Teams can only be checked in for scheduled matches");
      err.statusCode = 409;
      throw err;
    }

    let field = null;
    let teamName = null;
    if (payload.teamId === match.teamAId) {
      field = "teamACheckedInAt";
      teamName = match.teamA?.teamName || null;
    } else if (payload.teamId === match.teamBId) {
      field = "teamBCheckedInAt";
      teamName = match.teamB?.teamName || null;
    }

    if (!field) {
      const err = new Error("Selected team does not belong to this match");
      err.statusCode = 400;
      throw err;
    }

    const checkedInAt = payload.checkedIn === false ? null : new Date();
    const savedMatch = await tx.tournamentMatch.update({
      where: { id: match.id },
      data: { [field]: checkedInAt },
      include: {
        court: { select: { id: true, name: true, nameEn: true } },
        teamA: { select: { id: true, teamName: true } },
        teamB: { select: { id: true, teamName: true } },
        winnerTeam: { select: { id: true, teamName: true } },
      },
    });

    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: payload.checkedIn === false ? "team_checkin_cleared" : "team_checked_in",
      title: payload.checkedIn === false ? "Team check-in cleared" : "Team checked in",
      description: `${teamName || "A team"} ${payload.checkedIn === false ? "had its check-in cleared" : "checked in"} for round ${match.roundNumber}, match ${match.matchNumber}.`,
      metadata: {
        matchId: match.id,
        teamId: payload.teamId,
        teamName,
        checkedIn: payload.checkedIn !== false,
      },
    });

    return savedMatch;
  });

  return serializeMatch(updated);
}

async function advanceGroupStageToKnockout(tx, tournamentId) {
  const [groupMatches, groupTeams, existingKnockoutMatches] = await Promise.all([
    tx.tournamentMatch.findMany({
      where: { tournamentId, stage: "group" },
      orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
    }),
    tx.tournamentTeam.findMany({
      where: { tournamentId, status: "approved", groupId: { not: null } },
      select: {
        id: true,
        teamName: true,
        seed: true,
        groupId: true,
        createdAt: true,
      },
    }),
    tx.tournamentMatch.findMany({
      where: { tournamentId, stage: "knockout" },
      select: { id: true, closureId: true },
    }),
  ]);

  if (groupMatches.some((match) => match.status !== "completed")) {
    return;
  }

  const standings = buildGroupStandings(groupTeams, groupMatches);
  const nextMatchNumber =
    groupMatches.reduce((maxMatchNumber, match) => Math.max(maxMatchNumber, match.matchNumber || 0), 0) + 1;
  const knockoutMatches = buildKnockoutStageMatches(standings, nextMatchNumber);

  const staleClosureIds = existingKnockoutMatches.map((match) => match.closureId).filter(Boolean);
  if (staleClosureIds.length) {
    await tx.courtClosure.deleteMany({ where: { id: { in: staleClosureIds } } });
  }

  await tx.tournamentMatch.deleteMany({ where: { tournamentId, stage: "knockout" } });
  if (knockoutMatches.length > 0) {
    await tx.tournamentMatch.createMany({
      data: knockoutMatches.map((match) => ({
        tournamentId,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        status: match.status,
        stage: match.stage,
      })),
    });
    await propagateAutomaticWinners(tx, tournamentId);
  }
}

export async function recordTournamentMatchResultService(tournamentId, matchId, payload, currentUser) {
  assertManagerOrAdmin(currentUser);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      manager: { select: { id: true, name: true, businessName: true } },
      courts: { include: { court: true } },
      teams: { include: { captain: { select: { id: true, name: true } } } },
      matches: {
        include: {
          court: { select: { id: true, name: true, nameEn: true } },
          teamA: { select: { id: true, teamName: true } },
          teamB: { select: { id: true, teamName: true } },
          winnerTeam: { select: { id: true, teamName: true } },
        },
      },
    },
  });
  assertTournamentAccess(tournament, currentUser);
  assertTournamentEditableForMatches(tournament, "Recording match results");
  const teamsById = new Map((tournament.teams || []).map((team) => [team.id, team]));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "TournamentMatch" WHERE id = ${matchId} FOR UPDATE`;
    const match = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!match || match.tournamentId !== tournamentId) {
      const err = new Error("Tournament match not found");
      err.statusCode = 404;
      throw err;
    }
    if (!match.teamAId || !match.teamBId) {
      const err = new Error("This match cannot be scored until both teams are known");
      err.statusCode = 409;
      throw err;
    }
    if (match.status === "cancelled") {
      const err = new Error("Cancelled matches cannot receive results");
      err.statusCode = 409;
      throw err;
    }
    const wasCompleted = match.status === "completed";
    if (!wasCompleted && !["pending", "scheduled"].includes(match.status)) {
      const err = new Error("This match must be pending or scheduled before its result can be recorded");
      err.statusCode = 409;
      throw err;
    }
    if (![match.teamAId, match.teamBId].includes(payload.winnerTeamId)) {
      const err = new Error("Winner must be one of the teams in the selected match");
      err.statusCode = 400;
      throw err;
    }
    assertMatchScoreShape(payload.score);

    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: {
        winnerTeamId: payload.winnerTeamId,
        status: "completed",
        closureId: null,
        scoreJson: payload.score || null,
      },
    });
    await releaseMatchClosure(tx, match);
    if (match.stage === "knockout") {
      if (wasCompleted) {
        const knockoutMatches = await tx.tournamentMatch.findMany({
          where: { tournamentId, stage: "knockout" },
          orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
        });
        const knockoutRounds = getOrderedKnockoutRounds(knockoutMatches);
        const currentPointer = findKnockoutMatchPointer(knockoutRounds, match.id);
        if (!currentPointer) {
          const err = new Error("Tournament match not found in the knockout bracket");
          err.statusCode = 404;
          throw err;
        }

        let pointer = currentPointer;
        let shouldCarryWinner = true;
        while (true) {
          const nextPointer = getNextKnockoutMatchPointer(knockoutRounds, pointer.roundIndex, pointer.matchIndex);
          if (!nextPointer) break;

          const dependentMatch = nextPointer.match;
          if (["scheduled", "completed"].includes(dependentMatch.status)) {
            const err = new Error("This completed result cannot be changed because a dependent knockout match has already been scheduled or completed");
            err.statusCode = 409;
            throw err;
          }

          const dependentClosureToRelease = {
            closureId: dependentMatch.closureId,
            courtId: dependentMatch.courtId,
          };
          const nextSlotValue = shouldCarryWinner ? payload.winnerTeamId : null;
          await tx.tournamentMatch.update({
            where: { id: dependentMatch.id },
            data: {
              [nextPointer.slotField]: nextSlotValue,
              winnerTeamId: null,
              scoreJson: null,
              status: "pending",
              courtId: null,
              startAt: null,
              endAt: null,
              closureId: null,
              teamACheckedInAt: null,
              teamBCheckedInAt: null,
            },
          });
          await releaseMatchClosure(tx, dependentClosureToRelease);

          dependentMatch[nextPointer.slotField] = nextSlotValue;
          dependentMatch.winnerTeamId = null;
          dependentMatch.scoreJson = null;
          dependentMatch.status = "pending";
          dependentMatch.courtId = null;
          dependentMatch.startAt = null;
          dependentMatch.endAt = null;
          dependentMatch.closureId = null;
          dependentMatch.teamACheckedInAt = null;
          dependentMatch.teamBCheckedInAt = null;

          pointer = nextPointer;
          shouldCarryWinner = false;
        }
      }
      await propagateAutomaticWinners(tx, tournamentId);
    } else if (match.stage === "group") {
      if (wasCompleted) {
        const startedKnockoutMatches = await tx.tournamentMatch.count({
          where: {
            tournamentId,
            stage: "knockout",
            status: { in: ["scheduled", "completed"] },
          },
        });
        if (startedKnockoutMatches > 0) {
          const err = new Error("This completed group result cannot be changed because knockout matches have already been scheduled or completed");
          err.statusCode = 409;
          throw err;
        }
      }

      const remainingGroupMatches = await tx.tournamentMatch.count({
        where: { tournamentId, stage: "group", status: { not: "completed" } }
      });
      if (remainingGroupMatches === 0) {
        await advanceGroupStageToKnockout(tx, tournamentId);
      }
    }
    await logTournamentActivity(tx, {
      tournamentId,
      actorUserId: currentUser.id,
      action: "match_result_recorded",
      title: wasCompleted ? "Match result updated" : "Match result recorded",
      description: `${wasCompleted ? "Result updated" : "Result recorded"} for round ${match.roundNumber}, match ${match.matchNumber}.`,
      metadata: {
        matchId: match.id,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        winnerTeamId: payload.winnerTeamId,
        score: payload.score || null,
      },
    });
    await createNotificationsTx(
      tx,
      buildMatchResultNotifications(
        tournament,
        match,
        teamsById,
        currentUser,
        payload,
      ),
    );
    await syncTournamentLifecycleStatus(tx, tournamentId);
  });

  const refreshed = await getTournamentOrThrow(tournamentId, true);
  return {
    tournament: serializeTournament(refreshed, currentUser),
    match: serializeMatch(refreshed.matches.find((item) => item.id === matchId)),
  };
}
