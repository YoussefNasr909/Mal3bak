"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Info,
  LayoutDashboard,
  Link2,
  ListOrdered,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Printer,
  Share2,
  Swords,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  approveTournamentTeam,
  bulkReviewTournamentTeams,
  cancelTournament,
  checkInTournamentMatchTeam,
  closeTournamentRegistration,
  completeTournament,
  createTournament,
  deleteTournament,
  generateTournamentBracket,
  previewTournamentDraw,
  autoScheduleTournamentMatches,
  importTournamentTeams,
  sendTournamentMatchReminder,
  getTournament,
  joinTournamentWaitlist,
  listCourts,
  openTournamentRegistration,
  publishTournament,
  promoteNextTournamentWaitlistEntry,
  promoteTournamentWaitlistEntry,
  recordTournamentMatchResult,
  registerTournamentTeam,
  rejectTournamentTeam,
  scheduleTournamentMatch,
  updateTournament,
  withdrawTournamentTeam,
  withdrawTournamentWaitlistEntry,
} from "@/lib/api";
import type { Court, Tournament, TournamentMatch, TournamentDrawPreview } from "@/lib/types";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createEgyptDate } from "@/lib/date";
import { KnockoutBracket } from "@/components/tournaments/knockout-bracket";
import { CompetitionBoard } from "@/components/tournaments/competition-board";
import {
  buildCompetitionFilters,
  deriveCompetitionState,
  getKnockoutRoundLabel as getSharedKnockoutRoundLabel,
} from "@/lib/tournaments/competition";
import { cn } from "@/lib/utils";
import { AutoScheduleDialog, type AutoScheduleFormData } from "./details/auto-schedule-dialog";
import { BulkReviewDialog } from "./details/bulk-review-dialog";
import { EditTournamentDialog, type EditTournamentFormData } from "./details/edit-tournament-dialog";
import { RecordResultDialog, type ResultFormData } from "./details/record-result-dialog";
import { RegisterDialog, type RegisterFormData } from "./details/register-dialog";
import { ReviewTeamDialog } from "./details/review-team-dialog";
import { ScheduleMatchDialog, type ScheduleFormData } from "./details/schedule-match-dialog";
import { ShareDialog } from "./details/share-dialog";
import { TeamImportDialog, type TeamImportSubmitData, type TeamImportResult } from "./details/team-import-dialog";

type TournamentStatus = Tournament["status"];

const tournamentStatusTone: Record<TournamentStatus, string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
  published: "bg-sky-500/10 text-sky-700 dark:text-sky-200",
  registration_open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  registration_closed: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  in_progress: "bg-violet-500/10 text-violet-700 dark:text-violet-200",
  completed: "bg-green-500/10 text-green-700 dark:text-green-200",
  cancelled: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

const teamStatusTone: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
  withdrawn: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
};

const waitlistStatusTone: Record<string, string> = {
  waiting: "bg-sky-500/10 text-sky-700 dark:text-sky-200",
  promoted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  withdrawn: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
  removed: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

const matchStatusTone: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
  scheduled: "bg-sky-500/10 text-sky-700 dark:text-sky-200",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  cancelled: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

function isTeamActiveStatus(status?: string | null) {
  return status === "pending" || status === "approved";
}

function tournamentStatusLabel(status: string, ar: boolean) {
  const map: Record<string, string> = ar
    ? {
      draft: "مسودة",
      published: "منشور",
      registration_open: "التسجيل مفتوح",
      registration_closed: "التسجيل مغلق",
      in_progress: "جارية",
      completed: "مكتملة",
      cancelled: "ملغية",
    }
    : {
      draft: "Draft",
      published: "Published",
      registration_open: "Registration open",
      registration_closed: "Registration closed",
      in_progress: "In progress",
      completed: "Completed",
      cancelled: "Cancelled",
    };

  return map[status] || status;
}

function teamStatusLabel(status: string, ar: boolean) {
  const map: Record<string, string> = ar
    ? {
      pending: "قيد المراجعة",
      approved: "معتمد",
      rejected: "مرفوض",
      withdrawn: "منسحب",
    }
    : {
      pending: "Pending review",
      approved: "Approved",
      rejected: "Rejected",
      withdrawn: "Withdrawn",
    };

  return map[status] || status;
}

function waitlistStatusLabel(status: string, ar: boolean) {
  const map: Record<string, string> = ar
    ? {
      waiting: "بانتظار مقعد",
      promoted: "تمت الترقية",
      withdrawn: "منسحب",
      removed: "تمت الإزالة",
    }
    : {
      waiting: "Waiting for a spot",
      promoted: "Promoted",
      withdrawn: "Withdrawn",
      removed: "Removed",
    };

  return map[status] || status;
}

function matchStatusLabel(status: string, ar: boolean) {
  const map: Record<string, string> = ar
    ? {
      pending: "بانتظار التحديد",
      scheduled: "مجدولة",
      completed: "مكتملة",
      cancelled: "ملغاة",
    }
    : {
      pending: "Pending",
      scheduled: "Scheduled",
      completed: "Completed",
      cancelled: "Cancelled",
    };

  return map[status] || status;
}

function formatDate(value: string | Date | null | undefined, ar: boolean) {
  if (!value) return ar ? "غير محدد" : "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ar ? "غير محدد" : "Not set";

  return new Intl.DateTimeFormat(ar ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(date);
}

function toIsoFromCairoInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
    String(value || ""),
  );
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return createEgyptDate(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
  ).toISOString();
}

function toMs(value: string | Date | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseScoreInput(value: string) {
  const tokens = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const values = tokens.map((token) => Number(token));
  return {
    rawCount: tokens.length,
    values: values.filter((item) => Number.isFinite(item) && item >= 0),
  };
}

function getKnockoutRoundLabel(
  round: number,
  totalRounds: number,
  isArabic: boolean,
): string {
  const fromEnd = totalRounds - round; // 0 = final, 1 = semi, 2 = quarter
  if (fromEnd === 0) return isArabic ? "النهائي" : "Final";
  if (fromEnd === 1) return isArabic ? "نصف النهائي" : "Semi-Finals";
  if (fromEnd === 2) return isArabic ? "ربع النهائي" : "Quarter-Finals";
  return isArabic ? `الدور ${round}` : `Round ${round}`;
}

function groupMatches(matches: TournamentMatch[]) {
  const groups = new Map<string, TournamentMatch[]>();
  const knockoutRounds = new Map<number, TournamentMatch[]>();

  for (const match of matches || []) {
    if (match.stage === "group") {
      const gId = match.groupId || "?";
      if (!groups.has(gId)) groups.set(gId, []);
      groups.get(gId)?.push(match);
    } else {
      if (!knockoutRounds.has(match.roundNumber))
        knockoutRounds.set(match.roundNumber, []);
      knockoutRounds.get(match.roundNumber)?.push(match);
    }
  }

  return {
    groups: Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    ),
    knockoutRounds: Array.from(knockoutRounds.entries()).sort(
      (a, b) => a[0] - b[0],
    ),
  };
}

function getTournamentProgressText(tournament: Tournament, ar: boolean) {
  const now = Date.now();
  const openAt = toMs(tournament.registrationOpenAt);
  const closeAt = toMs(tournament.registrationCloseAt);
  const startAt = toMs(tournament.startDate);
  const activeTeams = (tournament.teams || []).filter((team) =>
    ["pending", "approved"].includes(team.status),
  ).length;
  const pendingTeams = (tournament.teams || []).filter(
    (team) => team.status === "pending",
  ).length;

  if (tournament.status === "draft") {
    return ar
      ? "هذه البطولة لا تزال مسودة وغير ظاهرة للاعبين."
      : "This tournament is still a draft and is hidden from players.";
  }
  if (tournament.status === "published") {
    return ar
      ? "البطولة منشورة وجاهزة لفتح التسجيل."
      : "The tournament is published and ready to open registration.";
  }
  if (tournament.status === "registration_open") {
    if (closeAt != null && closeAt < now) {
      if (pendingTeams > 0) {
        return ar
          ? "انتهت نافذة التسجيل الزمنية، لكن ما تزال هناك طلبات معلقة تحتاج إلى مراجعة قبل إغلاق التسجيل."
          : "The registration window has expired, but there are still pending teams to review before closing registration.";
      }
      return ar
        ? "انتهت نافذة التسجيل الزمنية، ويمكنك إغلاق التسجيل أو تحديث المواعيد."
        : "The registration window has expired. Close registration or update the schedule.";
    }
    if (activeTeams >= tournament.maxTeams) {
      return ar
        ? "امتلأت جميع المقاعد المتاحة. راجع الطلبات أو أنشئ الشجرة."
        : "All available spots are filled. Review the teams or generate the bracket.";
    }
    return ar
      ? "التسجيل متاح الآن ويمكن للاعبين إرسال فرقهم."
      : "Registration is live and players can submit teams now.";
  }
  if (tournament.status === "registration_closed") {
    if (pendingTeams > 0) {
      return ar
        ? "التسجيل مغلق، لكن ما تزال هناك طلبات معلقة تحتاج إلى مراجعة قبل إنشاء الشجرة."
        : "Registration is closed, but there are still pending teams to review before generating the bracket.";
    }
    return ar
      ? "التسجيل مغلق. يمكنك الآن إنشاء الشجرة وجدولة المباريات."
      : "Registration is closed. You can now generate the bracket and schedule matches.";
  }
  if (tournament.status === "in_progress") {
    return ar
      ? "المباريات جارية. احرص على تسجيل النتائج أولًا بأول."
      : "Matches are underway. Record results as the tournament progresses.";
  }
  if (tournament.status === "completed") {
    return ar
      ? "اكتملت البطولة وتم تحديد الفائز."
      : "The tournament is complete and a winner has been confirmed.";
  }
  return ar
    ? "تم إلغاء البطولة. لن تُقبل أي إجراءات جديدة."
    : "This tournament has been cancelled. No new actions are allowed.";
}

function getTournamentPhaseInfo(tournament: Tournament, ar: boolean) {
  const map: Record<string, { label: string; description: string; tone: string }> = {
    completed: {
      label: ar ? "منتهية" : "Completed",
      description: ar ? "اكتملت البطولة وتم اعتماد الفائز النهائي." : "The tournament is complete and the final winner is official.",
      tone: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-200",
    },
    cancelled: {
      label: ar ? "ملغية" : "Cancelled",
      description: ar ? "تم إيقاف هذه البطولة ولن تقبل إجراءات جديدة." : "This tournament has been stopped and no new actions are available.",
      tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
    },
    final: {
      label: ar ? "النهائي" : "Final",
      description: ar ? "كل المسارات تقود إلى المباراة النهائية." : "All remaining paths now lead to the final match.",
      tone: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-200",
    },
    knockout_stage: {
      label: ar ? "الأدوار الإقصائية" : "Knockout stage",
      description: ar ? "المباريات أصبحت بنظام خروج المغلوب حتى النهائي." : "The competition is now in knockout mode through the final.",
      tone: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
    },
    group_stage: {
      label: ar ? "دور المجموعات" : "Group stage",
      description: ar ? "الفرق تجمع النقاط وتتأهل حسب الترتيب." : "Teams are collecting results and qualifying through the table.",
      tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200",
    },
    draw_pending: {
      label: ar ? "بانتظار القرعة" : "Bracket pending",
      description: ar ? "راجع الفرق المعتمدة ثم أنشئ المجموعات والشجرة." : "Review approved teams, then generate groups and the bracket.",
      tone: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-200",
    },
    registration: {
      label: ar ? "التسجيل مفتوح" : "Registration open",
      description: ar ? "يمكن للاعبين إرسال الفرق أو الانضمام إلى قائمة الانتظار عند الامتلاء." : "Players can submit teams or join the waitlist when full.",
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    },
    setup: {
      label: ar ? "مسودة" : "Draft",
      description: ar ? "جهّز البطولة قبل النشر وفتح التسجيل." : "Prepare the tournament before publishing and opening registration.",
      tone: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200",
    },
  };

  if (tournament.competitionPhase && map[tournament.competitionPhase]) {
    return map[tournament.competitionPhase];
  }

  const matches = tournament.matches || [];
  const groupMatches = matches.filter((match) => match.stage === "group");
  const knockoutMatches = matches.filter((match) => match.stage === "knockout");
  const finalMatch = knockoutMatches.length
    ? knockoutMatches.reduce((latest, match) =>
      match.roundNumber > latest.roundNumber ||
        (match.roundNumber === latest.roundNumber && match.matchNumber > latest.matchNumber)
        ? match
        : latest,
    )
    : null;

  if (tournament.status === "completed") return map.completed;
  if (tournament.status === "cancelled") return map.cancelled;
  if (knockoutMatches.length > 0) {
    const nonFinalKnockoutMatches = knockoutMatches.filter((match) => match.id !== finalMatch?.id);
    const finalIsReady = Boolean(finalMatch?.teamAId && finalMatch?.teamBId);
    const earlierKnockoutComplete = nonFinalKnockoutMatches.every((match) => match.status === "completed");
    return finalMatch && finalMatch.status !== "completed" && finalIsReady && earlierKnockoutComplete
      ? map.final
      : map.knockout_stage;
  }
  if (groupMatches.length > 0) return map.group_stage;
  if (tournament.status === "registration_closed") return map.draw_pending;
  if (["published", "registration_open"].includes(tournament.status)) return map.registration;
  return map.setup;
}

function getTournamentFormatSummary(tournament: Tournament, ar: boolean) {
  const teamsPerGroup = Number(tournament.teamsPerGroup) || 4;
  const groups = tournament.maxTeams ? Math.floor(tournament.maxTeams / teamsPerGroup) : 0;
  const knockoutTeams = groups * 2;

  return ar
    ? `${groups} مجموعة · ${teamsPerGroup} فرق لكل مجموعة · أفضل فريقين يتأهلان · ${knockoutTeams} في الإقصائيات`
    : `${groups} groups of ${teamsPerGroup} · top 2 qualify · ${knockoutTeams} knockout teams`;
}

function getPlayerRegistrationMessage(
  tournament: Tournament,
  ar: boolean,
  myTeamStatus?: string | null,
  myWaitlistStatus?: string | null,
) {
  const now = Date.now();
  const openAt = toMs(tournament.registrationOpenAt);
  const closeAt = toMs(tournament.registrationCloseAt);
  const startAt = toMs(tournament.startDate);
  const activeTeams = (tournament.teams || []).filter((team) =>
    ["pending", "approved"].includes(team.status),
  ).length;
  const hasBracket = (tournament.matches || []).length > 0;
  const waitlistOpen =
    activeTeams >= tournament.maxTeams &&
    !hasBracket &&
    (startAt == null || startAt > now) &&
    (closeAt == null || closeAt >= now);

  if (tournament.status === "cancelled") {
    return ar
      ? "تم إلغاء البطولة. لن تُقبل أي إجراءات تسجيل جديدة."
      : "This tournament has been cancelled. No new registrations are allowed.";
  }
  if (tournament.status === "completed") {
    return ar
      ? "اكتملت البطولة وتم اعتماد الفائز."
      : "This tournament is complete and the winner has already been confirmed.";
  }
  if (tournament.status === "in_progress") {
    if (myTeamStatus === "approved") {
      return ar
        ? "بدأت البطولة بالفعل. تابع جدول المباريات لمعرفة تقدم فريقك."
        : "The tournament is already in progress. Check the matches tab to follow your team.";
    }
    if (myTeamStatus === "pending") {
      return ar
        ? "بدأت البطولة بينما كان طلبك لا يزال قيد المراجعة. تواصل مع الإدارة لمعرفة النتيجة النهائية."
        : "The tournament started while your request was still pending. Contact the manager for the final outcome.";
    }
    return ar
      ? "بدأت البطولة بالفعل ولم يعد التسجيل متاحًا."
      : "The tournament has already started and registration is no longer available.";
  }
  if (hasBracket) {
    if (myTeamStatus === "approved") {
      return ar
        ? "فريقك معتمد ومثبت داخل الشجرة. تابع قسم المباريات لمعرفة المواعيد."
        : "Your team is approved and locked into the bracket. Check the matches tab for scheduling updates.";
    }
    if (myTeamStatus === "pending") {
      return ar
        ? "تم إنشاء الشجرة قبل اعتماد طلبك، لذلك أصبح التسجيل مغلقًا على هذا الطلب."
        : "The bracket was generated before your request was approved, so this registration is now locked.";
    }
    if (myTeamStatus === "rejected") {
      return ar
        ? "تم رفض الطلب السابق، وأُغلقت الشجرة الآن لذلك لا يمكن إعادة الإرسال."
        : "Your earlier request was rejected, and the bracket is now locked so you cannot resubmit.";
    }
    return ar
      ? "تم إنشاء الشجرة، ولذلك أُغلق باب التسجيل."
      : "The bracket has already been generated, so registration is locked.";
  }
  if (tournament.status === "draft") {
    return ar
      ? "البطولة لا تزال مسودة وغير متاحة للتسجيل."
      : "The tournament is still a draft and is not open for registration.";
  }
  if (tournament.status === "published") {
    return ar
      ? "البطولة منشورة لكن التسجيل لم يُفتح بعد."
      : "The tournament is published, but registration has not been opened yet.";
  }
  if (tournament.status !== "registration_open" && openAt != null && openAt > now) {
    return ar ? "التسجيل لم يبدأ بعد." : "Registration has not opened yet.";
  }
  if (myWaitlistStatus === "waiting") {
    return ar
      ? "فريقك موجود في قائمة الانتظار الآن. سنبلغك إذا توفر مقعد أو تمت الترقية."
      : "Your team is currently on the waitlist. You will be notified if a slot opens or you are promoted.";
  }
  if (myTeamStatus === "pending") {
    return closeAt != null && closeAt < now
      ? ar
        ? "انتهت نافذة التسجيل لكن طلب فريقك ما يزال بانتظار مراجعة الإدارة."
        : "The registration window has ended, but your team is still waiting for manager review."
      : ar
        ? "تم إرسال طلب فريقك وهو الآن بانتظار موافقة الإدارة."
        : "Your team was submitted and is now waiting for manager approval.";
  }
  if (myTeamStatus === "approved") {
    return closeAt != null && closeAt < now
      ? ar
        ? "فريقك معتمد وبانتظار إنشاء الشجرة أو جدولة المباريات."
        : "Your team is approved and waiting for the bracket or match schedule."
      : ar
        ? "فريقك معتمد وجاهز للدخول في الشجرة."
        : "Your team is approved and ready for the bracket.";
  }
  if (myTeamStatus === "rejected") {
    return closeAt != null && closeAt < now
      ? ar
        ? "تم رفض طلبك السابق، وانتهت نافذة التسجيل لذلك لا يمكن إعادة الإرسال الآن."
        : "Your earlier request was rejected, and the registration window has ended so you cannot resubmit now."
      : ar
        ? "تم رفض التسجيل الحالي. يمكنك تعديل البيانات وإعادة الإرسال ما دام باب التسجيل ما يزال مفتوحًا."
        : "This registration was rejected. You can update the details and submit again while registration is still open.";
  }
  if (myTeamStatus === "withdrawn") {
    return closeAt != null && closeAt < now
      ? ar
        ? "لقد سحبت التسجيل سابقًا، لكن نافذة التسجيل انتهت الآن."
        : "You previously withdrew, and the registration window has now ended."
      : ar
        ? "لقد سحبت التسجيل سابقًا، ويمكنك التسجيل مجددًا إذا كان الباب ما يزال مفتوحًا."
        : "You previously withdrew, and can register again if the window is still open.";
  }
  if (closeAt != null && closeAt < now) {
    return tournament.status === "registration_closed"
      ? ar
        ? "تم إغلاق التسجيل لهذه البطولة."
        : "Registration is closed for this tournament."
      : ar
        ? "انتهت نافذة التسجيل."
        : "The registration window has ended.";
  }
  if (startAt != null && startAt <= now) {
    return ar ? "بدأت البطولة بالفعل." : "The tournament has already started.";
  }
  if (activeTeams >= tournament.maxTeams) {
    return waitlistOpen
      ? ar
        ? "اكتمل العدد المتاح من الفرق، لكن لا يزال بإمكانك الانضمام إلى قائمة الانتظار."
        : "The tournament is full, but you can still join the waitlist."
      : ar
        ? "اكتمل العدد المتاح من الفرق."
        : "The tournament is already full.";
  }

  return ar ? "يمكنك تسجيل فريقك الآن." : "You can register your team now.";
}

function getPlayerRegistrationGuide(args: {
  tournament: Tournament;
  ar: boolean;
  myTeam?: Tournament["teams"][number] | null;
  myWaitlistEntry?: NonNullable<Tournament["waitlistEntries"]>[number] | null;
}) {
  const { tournament, ar, myTeam, myWaitlistEntry } = args;
  const myTeamStatus = myTeam?.status || null;
  const myWaitlistStatus = myWaitlistEntry?.status || null;
  const hasBracket = (tournament.matches || []).length > 0;
  const now = Date.now();
  const openAt = toMs(tournament.registrationOpenAt);
  const closeAt = toMs(tournament.registrationCloseAt);
  const startAt = toMs(tournament.startDate);
  const registrationNotYetOpen = tournament.status !== "registration_open" && openAt != null && openAt > now;
  const registrationClosed = closeAt != null && closeAt < now;
  const started = startAt != null && startAt <= now;
  const waitlistOpen =
    tournament.status === "registration_open" &&
    (tournament.teams || []).filter((team) =>
      ["pending", "approved"].includes(team.status),
    ).length >= tournament.maxTeams &&
    !hasBracket &&
    !started &&
    !registrationClosed;

  if (myWaitlistStatus === "waiting") {
    return {
      title: ar ? "فريقك على قائمة الانتظار" : "Your team is on the waitlist",
      description: ar
        ? "أُضيف فريقك إلى قائمة الانتظار لأن البطولة ممتلئة حاليًا. ستصلك إشعارات عند توفر مقعد أو عند اتخاذ أي إجراء."
        : "Your team was added to the waitlist because the tournament is currently full. You will receive updates when a slot opens or the status changes.",
      steps: ar
        ? [
          "ترتيبك يظهر داخل قسم قائمة الانتظار عندما يكون متاحًا.",
          "إذا انسحب فريق أو توفر مكان، يمكن للمدير ترقيتك مباشرة.",
          "يمكنك مغادرة قائمة الانتظار في أي وقت قبل بدء البطولة.",
        ]
        : [
          "Your queue position appears in the waitlist section when available.",
          "If a team withdraws and a slot opens, the manager can promote you directly.",
          "You can leave the waitlist any time before the tournament starts.",
        ],
    };
  }

  if (myTeamStatus === "approved") {
    return {
      title: ar ? "فريقك أصبح جاهزًا" : "Your team is ready",
      description: ar
        ? "لن تحتاج إلى إعادة الإرسال. راقب الشجرة والمباريات لمعرفة الخطوة التالية."
        : "You do not need to submit again. Watch the bracket and matches for the next update.",
      steps: ar
        ? [
          "انتظر اعتماد الشجرة إذا لم تُنشأ بعد.",
          "بعد الجدولة ستظهر مواعيدكم في قسم المباريات.",
          "يمكنك متابعة أي تحديث أو ملاحظة جديدة من هذه الصفحة.",
        ]
        : [
          "Wait for the bracket if it has not been generated yet.",
          "Your match times will appear in the matches tab once scheduled.",
          "Any new update or note will appear on this page.",
        ],
    };
  }

  if (myTeamStatus === "pending") {
    return {
      title: ar ? "طلبك قيد المراجعة" : "Your request is under review",
      description:
        hasBracket || started
          ? ar
            ? "لا تحتاج إلى إرسال الطلب مرة أخرى الآن. راقب هذه الصفحة لمعرفة القرار النهائي."
            : "You do not need to submit again right now. Keep an eye on this page for the final decision."
          : ar
            ? "أرسل فريقك مرة واحدة فقط ثم انتظر مراجعة الإدارة قبل اعتماد الشجرة."
            : "Submit your team once, then wait for manager review before the bracket is finalized.",
      steps: ar
        ? [
          registrationClosed
            ? "انتهت نافذة التسجيل، لكن الطلبات المرسلة ما تزال قيد المراجعة."
            : "الإدارة تراجع الطلبات المرسلة قبل تجهيز الشجرة.",
          "سترى الحالة تتحدث هنا بمجرد اعتماد الطلب أو رفضه.",
          "إذا رُفض الطلب وكان التسجيل ما يزال مفتوحًا، يمكنك التعديل ثم إعادة الإرسال.",
        ]
        : [
          registrationClosed
            ? "The registration window has ended, but submitted requests can still be reviewed."
            : "Managers review submitted teams before the bracket is prepared.",
          "Your status here will update as soon as the request is approved or rejected.",
          "If the request is rejected while registration is still open, you can edit it and submit again.",
        ],
    };
  }

  if (myTeamStatus === "rejected") {
    return {
      title: ar
        ? "عدّل الطلب ثم أعد الإرسال"
        : "Update the request and resubmit",
      description:
        registrationClosed || hasBracket || started
          ? ar
            ? "الطلب السابق لم يُقبل، ولا يمكن إعادة الإرسال الآن لأن نافذة التسجيل لم تعد متاحة."
            : "The previous request was not approved, and you cannot resubmit now because the registration window is no longer available."
          : ar
            ? "يمكنك تعديل اسم الفريق أو بيانات الشريك ثم إرسال الطلب مرة أخرى."
            : "You can update the team name or partner details and then submit the request again.",
      steps: ar
        ? [
          "راجع الملاحظة الأخيرة إن وجدت لفهم سبب الرفض.",
          "حدّث البيانات المطلوبة داخل النموذج.",
          "أعد الإرسال فقط إذا كان التسجيل ما يزال مفتوحًا.",
        ]
        : [
          "Check the latest note if one was added so you know what to fix.",
          "Update the needed details inside the form.",
          "Resubmit only while registration is still open.",
        ],
    };
  }

  if (myTeamStatus === "withdrawn") {
    return {
      title: ar ? "يمكنك التسجيل من جديد" : "You can register again",
      description:
        registrationClosed || hasBracket || started
          ? ar
            ? "لقد سحبت الطلب السابق، لكن التسجيل لم يعد متاحًا الآن."
            : "You withdrew the earlier request, and registration is no longer available now."
          : ar
            ? "ابدأ من جديد بفريقك الحالي أو حدّث البيانات قبل الإرسال."
            : "Start again with your team details, or update them before resubmitting.",
      steps: ar
        ? [
          "أدخل اسم الفريق كما تريد ظهوره في الشجرة.",
          "أضف اسم الشريك ورقمًا يساعد الإدارة على التواصل عند الحاجة.",
          "أرسل الطلب مرة أخرى ما دام التسجيل مفتوحًا.",
        ]
        : [
          "Enter the team name exactly as you want it to appear in the bracket.",
          "Add the partner name and a phone number that helps the manager contact you if needed.",
          "Submit again while registration is still open.",
        ],
    };
  }

  return {
    title: waitlistOpen
      ? ar
        ? "البطولة ممتلئة الآن"
        : "This tournament is full right now"
      : ar
        ? "كيف يعمل تسجيل الفرق"
        : "How team registration works",
    description: registrationNotYetOpen
      ? ar
        ? "جهّز بيانات فريقك من الآن، وسيصبح النموذج متاحًا عندما تفتح نافذة التسجيل."
        : "Prepare your team details now, and the form will become available when registration opens."
      : hasBracket || started
        ? ar
          ? "أُغلقت هذه البطولة أمام التسجيل الجديد، لكن يمكنك متابعة الشجرة والمباريات من هنا."
          : "This tournament is closed to new registrations, but you can still follow the bracket and matches here."
        : waitlistOpen
          ? ar
            ? "يمكنك الانضمام إلى قائمة الانتظار الآن، وسيتواصل النظام معك إذا أصبح هناك مكان شاغر."
            : "You can join the waitlist now, and the system will notify you if a slot becomes available."
          : ar
            ? "أنشئ فريقًا زوجيًا واحدًا باسم واضح وبيانات شريك صحيحة، ثم أرسله للمراجعة."
            : "Create one doubles team with a clear name and accurate partner details, then submit it for review.",
    steps: ar
      ? [
        ...(waitlistOpen
          ? [
            "أدخل اسم الفريق واسم الشريك كما سيظهران عند فتح مكان.",
            "سيحتفظ المدير بطلبك في ترتيب الانتظار الحالي.",
            "عند توفر مقعد ستتلقى إشعارًا ويمكن ترقية فريقك مباشرة.",
          ]
          : [
            "اختر اسمًا للفريق سيظهر للاعبين داخل الشجرة.",
            "أدخل اسم الشريك، ويمكنك إضافة رقم هاتفه للمراجعة السريعة.",
            "بعد الإرسال ستراجع الإدارة الطلب ثم تعتمد الفريق أو ترفضه مع ملاحظة عند الحاجة.",
          ]),
      ]
      : [
        ...(waitlistOpen
          ? [
            "Enter the team name and partner details exactly as they should appear if a slot opens.",
            "The manager keeps your request in the current waitlist order.",
            "If a spot becomes available, your team can be promoted directly and you will be notified.",
          ]
          : [
            "Choose a team name that will be shown in the public bracket.",
            "Enter the partner name, and optionally add a phone number for quick coordination.",
            "After submission, the manager reviews the request and either approves it or rejects it with a note when needed.",
          ]),
      ],
  };
}

function getTournamentNextStepSummary(args: {
  tournament: Tournament;
  canManage: boolean;
  isArabic: boolean;
  myTeamStatus?: string | null;
  myWaitlistStatus?: string | null;
  pendingTeamsCount: number;
  approvedTeamsCount: number;
  remainingMatchesCount: number;
  hasBracket: boolean;
  hasScheduledOrCompletedMatches: boolean;
  registrationClosedByTime: boolean;
}) {
  const {
    tournament,
    canManage,
    isArabic,
    myTeamStatus,
    myWaitlistStatus,
    pendingTeamsCount,
    approvedTeamsCount,
    remainingMatchesCount,
    hasBracket,
    hasScheduledOrCompletedMatches,
    registrationClosedByTime,
  } = args;

  if (canManage) {
    if (tournament.status === "draft") {
      return {
        title: isArabic
          ? "الخطوة التالية: نشر البطولة"
          : "Next step: publish the tournament",
        description: isArabic
          ? "بعد النشر ستصبح البطولة جاهزة لفتح التسجيل للاعبين."
          : "After publishing, the tournament will be ready for player registration.",
      };
    }
    if (tournament.status === "published") {
      return {
        title: isArabic
          ? "الخطوة التالية: فتح التسجيل"
          : "Next step: open registration",
        description: isArabic
          ? "تحقق من المواعيد ثم افتح التسجيل ليستطيع اللاعبون إرسال فرقهم."
          : "Confirm the dates, then open registration so players can submit teams.",
      };
    }
    if (
      ["registration_open", "registration_closed"].includes(tournament.status)
    ) {
      if (pendingTeamsCount > 0) {
        return {
          title: isArabic
            ? "الخطوة التالية: مراجعة الطلبات"
            : "Next step: review pending teams",
          description:
            tournament.status === "registration_closed"
              ? isArabic
                ? `أغلقت نافذة التسجيل، لكن ما يزال لديك ${pendingTeamsCount} طلب${pendingTeamsCount > 1 ? "ات" : ""} تحتاج إلى قرار قبل إنشاء الشجرة.`
                : `Registration is closed, but ${pendingTeamsCount} team request${pendingTeamsCount > 1 ? "s still need" : " still needs"} your decision before bracket setup.`
              : isArabic
                ? `يوجد ${pendingTeamsCount} طلب${pendingTeamsCount > 1 ? "ات" : ""} بانتظار قرارك قبل تجهيز الشجرة.`
                : `${pendingTeamsCount} team request${pendingTeamsCount > 1 ? "s are" : " is"} waiting for your review before bracket setup.`,
        };
      }
      if (
        tournament.status === "registration_open" &&
        (approvedTeamsCount >= 2 || registrationClosedByTime)
      ) {
        return {
          title: isArabic
            ? "الخطوة التالية: إغلاق التسجيل"
            : "Next step: close registration",
          description: isArabic
            ? "عند اكتمال المراجعة، أغلق التسجيل ثم أنشئ الشجرة وابدأ الجدولة."
            : "Once review is complete, close registration, generate the bracket, and start scheduling.",
        };
      }
    }
    if (tournament.status === "registration_closed" && !hasBracket) {
      return {
        title: isArabic
          ? "الخطوة التالية: إنشاء الشجرة"
          : "Next step: generate the bracket",
        description: isArabic
          ? "اعتمد فريقين على الأقل لإنشاء الشجرة وتوزيع المباريات."
          : "Approve at least two teams to generate the bracket and create matchups.",
      };
    }
    if (hasBracket && !hasScheduledOrCompletedMatches) {
      return {
        title: isArabic
          ? "الخطوة التالية: جدولة أول مباراة"
          : "Next step: schedule the first match",
        description: isArabic
          ? "اختر ملعبًا ووقتًا لكل مباراة حتى ينتقل الحدث إلى التنفيذ الفعلي."
          : "Assign a court and time to each match so the tournament can move into real operation.",
      };
    }
    if (tournament.status === "in_progress" && remainingMatchesCount > 0) {
      return {
        title: isArabic
          ? "الخطوة التالية: متابعة النتائج"
          : "Next step: keep results updated",
        description: isArabic
          ? "استمر في تسجيل النتائج حتى تكتمل جميع المباريات ويُحسم الفائز النهائي."
          : "Continue recording results until all matches are complete and the winner is confirmed.",
      };
    }
    if (tournament.status === "completed") {
      return {
        title: isArabic ? "البطولة مكتملة" : "Tournament completed",
        description: isArabic
          ? "تم إنهاء جميع المباريات وتأكيد الفريق الفائز."
          : "All matches are finished and the winning team has been confirmed.",
      };
    }
    return {
      title: isArabic ? "لا توجد خطوات مفتوحة" : "No open next steps",
      description: isArabic
        ? "راجع الحالة الحالية إذا احتجت إلى تعديل أو متابعة إضافية."
        : "Review the current state if you need any further changes or follow-up.",
    };
  }

  if (myWaitlistStatus === "waiting") {
    return {
      title: isArabic ? "أنت على قائمة الانتظار" : "You are on the waitlist",
      description: isArabic
        ? "راقب ترتيبك والتحديثات هنا. ستصلك إشعارات إذا فُتح مكان لفريقك."
        : "Watch your queue position and updates here. You will be notified if a spot opens for your team.",
    };
  }

  if (myTeamStatus === "pending") {
    return {
      title: isArabic ? "بانتظار مراجعة الإدارة" : "Waiting for manager review",
      description: isArabic
        ? "تم إرسال فريقك بنجاح، وستتلقى الحالة الجديدة بمجرد مراجعة الطلب."
        : "Your team was submitted successfully. The status will update once the manager reviews it.",
    };
  }
  if (myTeamStatus === "approved") {
    return {
      title: isArabic ? "فريقك جاهز" : "Your team is ready",
      description: isArabic
        ? "تم اعتماد فريقك وسيظهر في الشجرة عند بدء المباريات."
        : "Your team has been approved and will appear in the bracket once matches are set.",
    };
  }
  if (myTeamStatus === "rejected") {
    return {
      title: isArabic
        ? "يمكنك التعديل ثم إعادة الإرسال"
        : "Update and resubmit",
      description: isArabic
        ? "صحح بيانات الفريق ثم أعد إرسال الطلب ما دام التسجيل ما يزال مفتوحًا."
        : "Correct your team details and submit again while registration is still open.",
    };
  }

  return {
    title: isArabic ? "تحقق من حالة التسجيل" : "Check registration status",
    description: getPlayerRegistrationMessage(
      tournament,
      isArabic,
      myTeamStatus,
      myWaitlistStatus,
    ),
  };
}

function formatCountdownDuration(ms: number, ar: boolean) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(ar ? `${days} يوم` : `${days}d`);
  }
  if (hours > 0 && parts.length < 2) {
    parts.push(ar ? `${hours} ساعة` : `${hours}h`);
  }
  if (
    (parts.length === 0 || parts.length < 2) &&
    (minutes > 0 || totalMinutes === 0)
  ) {
    parts.push(ar ? `${minutes} دقيقة` : `${minutes}m`);
  }

  return parts.slice(0, 2).join(ar ? " و " : " ");
}

function getTournamentCountdownInfo(tournament: Tournament, ar: boolean) {
  const now = Date.now();
  const registrationOpenAt = toMs(tournament.registrationOpenAt);
  const registrationCloseAt = toMs(tournament.registrationCloseAt);
  const tournamentStartAt = toMs(tournament.startDate);
  const activeTeams = (tournament.teams || []).filter((team) =>
    ["pending", "approved"].includes(team.status),
  ).length;

  if (
    tournament.status === "published" &&
    registrationOpenAt != null &&
    registrationOpenAt > now
  ) {
    return {
      label: ar ? "يفتح التسجيل خلال" : "Registration opens in",
      value: formatCountdownDuration(registrationOpenAt - now, ar),
      note: ar
        ? formatDate(tournament.registrationOpenAt, ar)
        : formatDate(tournament.registrationOpenAt, ar),
      tone: "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-200",
    };
  }

  if (tournament.status === "registration_open") {
    if (activeTeams >= tournament.maxTeams) {
      return {
        label: ar ? "اكتمل العدد المتاح" : "Tournament is full",
        value: ar ? "لا توجد أماكن إضافية" : "No additional spots",
        note: ar
          ? "يمكن للإدارة متابعة المراجعة أو إنشاء الشجرة الآن."
          : "Managers can finish reviews or move on to the bracket.",
        tone: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-200",
      };
    }
    if (registrationCloseAt != null && registrationCloseAt > now) {
      return {
        label: ar ? "يغلق التسجيل خلال" : "Registration closes in",
        value: formatCountdownDuration(registrationCloseAt - now, ar),
        note: formatDate(tournament.registrationCloseAt, ar),
        tone: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200",
      };
    }
  }

  if (
    ["published", "registration_closed"].includes(tournament.status) &&
    tournamentStartAt != null &&
    tournamentStartAt > now
  ) {
    return {
      label: ar ? "تبدأ البطولة خلال" : "Tournament starts in",
      value: formatCountdownDuration(tournamentStartAt - now, ar),
      note: formatDate(tournament.startDate, ar),
      tone: "border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-200",
    };
  }

  if (tournament.status === "in_progress" && tournamentStartAt != null) {
    return {
      label: ar ? "بدأت البطولة" : "Tournament started",
      value: formatDate(tournament.startDate, ar),
      note: ar
        ? "تأكد من متابعة الجدول والنتائج أولًا بأول."
        : "Keep the schedule and results updated as matches finish.",
      tone: "border-primary/20 bg-primary/5 text-primary",
    };
  }

  return null;
}

function buildTournamentTimeline(tournament: Tournament, ar: boolean) {
  const hasBracket = (tournament.matches || []).length > 0;
  const hasRegistrations = (tournament.teams || []).length > 0;
  const steps = [
    { key: "draft", label: ar ? "مسودة" : "Draft" },
    { key: "published", label: ar ? "منشورة" : "Published" },
    {
      key: "registration_open",
      label: ar ? "التسجيل مفتوح" : "Registration open",
    },
    {
      key: "registration_closed",
      label: ar ? "التسجيل مغلق" : "Registration closed",
    },
    { key: "bracket", label: ar ? "تم إنشاء الشجرة" : "Bracket generated" },
    { key: "in_progress", label: ar ? "جارية" : "In progress" },
    { key: "completed", label: ar ? "مكتملة" : "Completed" },
  ];

  let currentKey = "draft";
  const completedKeys = new Set<string>();

  switch (tournament.status) {
    case "draft":
      currentKey = "draft";
      break;
    case "published":
      completedKeys.add("draft");
      currentKey = "published";
      break;
    case "registration_open":
      completedKeys.add("draft");
      completedKeys.add("published");
      currentKey = "registration_open";
      break;
    case "registration_closed":
      completedKeys.add("draft");
      completedKeys.add("published");
      completedKeys.add("registration_open");
      if (hasBracket) {
        completedKeys.add("registration_closed");
        currentKey = "bracket";
      } else {
        currentKey = "registration_closed";
      }
      break;
    case "in_progress":
      completedKeys.add("draft");
      completedKeys.add("published");
      completedKeys.add("registration_open");
      completedKeys.add("registration_closed");
      completedKeys.add("bracket");
      currentKey = "in_progress";
      break;
    case "completed":
      completedKeys.add("draft");
      completedKeys.add("published");
      completedKeys.add("registration_open");
      completedKeys.add("registration_closed");
      completedKeys.add("bracket");
      completedKeys.add("in_progress");
      currentKey = "completed";
      break;
    case "cancelled":
      if (hasBracket) {
        completedKeys.add("draft");
        completedKeys.add("published");
        completedKeys.add("registration_open");
        completedKeys.add("registration_closed");
        currentKey = "bracket";
      } else if (
        hasRegistrations ||
        tournament.registrationOpenAt ||
        tournament.registrationCloseAt
      ) {
        completedKeys.add("draft");
        completedKeys.add("published");
        currentKey = "registration_closed";
      } else {
        completedKeys.add("draft");
        currentKey = "published";
      }
      break;
    default:
      break;
  }

  return steps.map((step) => ({
    ...step,
    state: completedKeys.has(step.key)
      ? "completed"
      : step.key === currentKey
        ? "current"
        : "upcoming",
  }));
}

function buildManagerWarnings(args: {
  tournament: Tournament;
  ar: boolean;
  activeTeamsCount: number;
  pendingTeamsCount: number;
  approvedTeamsCount: number;
  waitingWaitlistCount: number;
  nextWaitingTeamName?: string | null;
  remainingMatchesCount: number;
  hasBracket: boolean;
  hasScheduledOrCompletedMatches: boolean;
  registrationClosedByTime: boolean;
}) {
  const {
    tournament,
    ar,
    activeTeamsCount,
    pendingTeamsCount,
    approvedTeamsCount,
    waitingWaitlistCount,
    nextWaitingTeamName,
    remainingMatchesCount,
    hasBracket,
    hasScheduledOrCompletedMatches,
    registrationClosedByTime,
  } = args;
  const warnings: Array<{
    tone: "warning" | "info" | "success";
    title: string;
    description: string;
  }> = [];
  const registrationCloseAtMs = toMs(tournament.registrationCloseAt);
  const nowMs = Date.now();
  const registrationClosingSoon =
    registrationCloseAtMs != null &&
    registrationCloseAtMs > nowMs &&
    registrationCloseAtMs - nowMs <= 24 * 60 * 60 * 1000;

  if (!tournament.startDate || !tournament.endDate) {
    warnings.push({
      tone: "warning",
      title: ar
        ? "مواعيد البطولة تحتاج إلى ضبط"
        : "Tournament dates need attention",
      description: ar
        ? "حدّد وقت البداية والنهاية حتى تصبح الجدولة وتوقعات اللاعبين أوضح."
        : "Set both the tournament start and end time so match scheduling and player expectations stay clear.",
    });
  }

  if ((tournament.courts || []).length === 0) {
    warnings.push({
      tone: "warning",
      title: ar ? "لا توجد ملاعب مخصصة" : "No courts are assigned",
      description: ar
        ? "أضف ملعبًا نشطًا واحدًا على الأقل قبل البدء في جدولة المباريات."
        : "Add at least one active court before you try to schedule bracket matches.",
    });
  }

  if (pendingTeamsCount > 0) {
    warnings.push({
      tone: "warning",
      title: ar
        ? "ما تزال هناك طلبات تحتاج إلى مراجعة"
        : "Pending teams still need review",
      description: ar
        ? `يوجد ${pendingTeamsCount} طلب${pendingTeamsCount > 1 ? "ات" : ""} ينتظر قرارك قبل تجهيز الشجرة بشكل نهائي.`
        : `${pendingTeamsCount} team request${pendingTeamsCount > 1 ? "s are" : " is"} waiting for a decision before the bracket can be finalized cleanly.`,
    });
  }

  if (
    tournament.status === "registration_open" &&
    pendingTeamsCount > 0 &&
    registrationClosingSoon
  ) {
    warnings.push({
      tone: "warning",
      title: ar ? "نافذة التسجيل تقترب من الإغلاق" : "Registration closes soon",
      description: ar
        ? "راجع الطلبات المعلّقة سريعاً حتى لا تبقى فرق بانتظار قرار قريباً من موعد الإغلاق."
        : "Review the remaining pending teams soon so no registration is left hanging near the close window.",
    });
  }

  if (tournament.status === "registration_open" && registrationClosedByTime) {
    warnings.push({
      tone: "warning",
      title: ar
        ? "انتهت نافذة التسجيل الزمنية"
        : "The registration window has already expired",
      description: ar
        ? "أغلق التسجيل أو حدّث المواعيد إذا كنت لا تزال ترغب في استقبال فرق جديدة."
        : "Close registration or update the schedule if you still want to accept new teams.",
    });
  }

  if (
    ["registration_open", "registration_closed"].includes(tournament.status) &&
    approvedTeamsCount === 0
  ) {
    warnings.push({
      tone: "info",
      title: ar ? "لا توجد فرق معتمدة بعد" : "No approved teams yet",
      description: ar
        ? "اعتمد فريقين على الأقل قبل إنشاء الشجرة."
        : "Approve at least two teams before the bracket can be generated.",
    });
  }

  if (
    tournament.status === "registration_closed" &&
    !hasBracket &&
    approvedTeamsCount >= 2 &&
    pendingTeamsCount === 0
  ) {
    warnings.push({
      tone: "success",
      title: ar ? "الشجرة جاهزة للإنشاء" : "Bracket generation is ready",
      description: ar
        ? "يوجد عدد كافٍ من الفرق المعتمدة ولا توجد طلبات معلقة تعطل الخطوة التالية."
        : "There are enough approved teams and no pending reviews blocking the next step.",
    });
  }

  if (
    !hasBracket &&
    activeTeamsCount < tournament.maxTeams &&
    waitingWaitlistCount > 0
  ) {
    warnings.push({
      tone: "success",
      title: ar
        ? "يمكن ترقية فريق من قائمة الانتظار"
        : "A waitlist promotion is ready",
      description: ar
        ? `${nextWaitingTeamName || "الفريق التالي"} هو المرشح التالي لملء المقعد الشاغر.`
        : `${nextWaitingTeamName || "The next waitlisted team"} can now be promoted into the main field.`,
    });
  }

  if (hasBracket && !hasScheduledOrCompletedMatches) {
    warnings.push({
      tone: "info",
      title: ar
        ? "المباريات ما تزال بحاجة إلى جدولة"
        : "Matches still need scheduling",
      description: ar
        ? "تم إنشاء الشجرة، لكن لم يتم تحديد ملعب أو موعد لأي مباراة بعد."
        : "The bracket exists, but no match has a court or time yet.",
    });
  }

  if (tournament.status === "in_progress" && remainingMatchesCount > 0) {
    warnings.push({
      tone: "info",
      title: ar
        ? "تابع تسجيل النتائج أولًا بأول"
        : "Keep match results up to date",
      description: ar
        ? `ما تزال ${remainingMatchesCount} مباراة${remainingMatchesCount > 1 ? "ت" : ""} غير محسومة، لذلك لم يُغلق تحديد الفائز النهائي بعد.`
        : `${remainingMatchesCount} match${remainingMatchesCount > 1 ? "es are" : " is"} still unresolved, so the tournament winner is not locked in yet.`,
    });
  }

  return warnings;
}

function getActivityTone(action: string) {
  if (["team_rejected", "cancelled"].includes(action))
    return "border-rose-500/20 bg-rose-500/5";
  if (
    [
      "team_approved",
      "bracket_generated",
      "registration_auto_opened",
      "registration_open",
      "status_completed",
      "completed",
    ].includes(action)
  )
    return "border-emerald-500/20 bg-emerald-500/5";
  if (["registration_auto_closed", "registration_closed"].includes(action))
    return "border-amber-500/20 bg-amber-500/5";
  return "border-border/60 bg-muted/30";
}

function getResultTypeLabel(
  resultType: string | null | undefined,
  ar: boolean,
) {
  switch (resultType) {
    case "walkover":
      return ar ? "فوز بالانسحاب" : "Walkover";
    case "retired":
      return ar ? "فوز بسبب الانسحاب" : "Retired";
    default:
      return ar ? "نتيجة عادية" : "Standard result";
  }
}

function formatSetScorePairs(
  teamA: Array<number | string> | null | undefined,
  teamB: Array<number | string> | null | undefined,
) {
  const aValues = Array.isArray(teamA) ? teamA : [];
  const bValues = Array.isArray(teamB) ? teamB : [];
  const setCount = Math.max(aValues.length, bValues.length);
  if (setCount === 0) return "";

  return Array.from({ length: setCount }, (_, index) => {
    const a = aValues[index] ?? "—";
    const b = bValues[index] ?? "—";
    return `${a}-${b}`;
  }).join(" / ");
}

function getMatchScoreSummary(match: TournamentMatch, ar: boolean) {
  const resultType = match.scoreJson?.resultType || "standard";
  if (resultType === "walkover" || resultType === "retired") {
    return getResultTypeLabel(resultType, ar);
  }

  const summary = formatSetScorePairs(match.scoreJson?.teamA, match.scoreJson?.teamB);
  if (!summary) {
    return ar ? "تم حفظ النتيجة" : "Result recorded";
  }

  return summary;
}

function getRankingRulesText(ar: boolean) {
  return ar
    ? ["الانتصارات", "النقاط (3 لكل مجموعة فائزة)", "فارق الأشواط", "الأشواط المكتسبة", "التصنيف / ترتيب القرعة"]
    : ["Wins", "PTS (3 per set won)", "Game difference", "Games won", "Seed / draw order"];
}

function getScorePolicyText(ar: boolean) {
  return ar
    ? "اختر الفائز، ثم أدخل نتيجة كل مجموعة كما تم تسجيلها. كل مجموعة يكون رقم الفريق فيها أعلى تضيف 3 نقاط لهذا الفريق، والتعادل في المجموعة يعطي 0 للطرفين. الترتيب يعتمد على الانتصارات ثم النقاط ثم فارق الأشواط ثم الأشواط المكتسبة."
    : "Choose the winner, then enter each set score as recorded. Every set where a team has the higher number gives that team 3 PTS; tied sets give 0 to both. Ranking uses wins, then PTS, then game difference, then games won.";
}

function getCheckInBadgeClass(checkedInAt: string | Date | null | undefined) {
  return checkedInAt
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";
}

function getCheckInBadgeLabel(
  checkedInAt: string | Date | null | undefined,
  ar: boolean,
) {
  return checkedInAt
    ? ar
      ? "تم تسجيل الحضور"
      : "Checked in"
    : ar
      ? "بانتظار الحضور"
      : "Awaiting check-in";
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  if (typeof window === "undefined") return;
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function getPublicTournamentPath(tournamentId: string) {
  return `/tournaments/${tournamentId}`;
}

// ─── Bracket visual helpers ──────────────────────────────────────────────────

function BracketMatchBox({
  match,
  isArabic,
  isFinal,
}: {
  match: TournamentMatch;
  isArabic: boolean;
  isFinal: boolean;
}) {
  const teamA = match.teamAName || (isArabic ? "سيحدد" : "TBD");
  const teamB = match.teamBName || (isArabic ? "سيحدد" : "TBD");
  const winA = Boolean(
    match.winnerTeamId && match.winnerTeamId === match.teamAId,
  );
  const winB = Boolean(
    match.winnerTeamId && match.winnerTeamId === match.teamBId,
  );
  const scoreA = Array.isArray(match.scoreJson?.teamA) ? match.scoreJson.teamA : [];
  const scoreB = Array.isArray(match.scoreJson?.teamB) ? match.scoreJson.teamB : [];

  return (
    <div
      className={`w-44 overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md ${isFinal ? "border-yellow-400/60" : "border-border"
        }`}
    >
      {isFinal && (
        <div className="border-b border-yellow-400/20 bg-yellow-400/5 px-2 py-0.5 text-center text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
          🏆 {isArabic ? "النهائي" : "Final"}
        </div>
      )}
      <div
        className={`flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-sm ${winA
          ? "bg-primary/10 font-semibold text-foreground"
          : "text-muted-foreground"
          }`}
      >
        <span className="max-w-[7rem] truncate" title={teamA}>{teamA}</span>
        {scoreA.length ? (
          <span className="flex shrink-0 items-center gap-1 tabular-nums" aria-label={isArabic ? "نتيجة الفريق الأول" : "Team A set scores"}>
            {scoreA.map((score, index) => (
              <span key={index} className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-bold text-foreground shadow-sm">
                {score}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${winB
          ? "bg-primary/10 font-semibold text-foreground"
          : "text-muted-foreground"
          }`}
      >
        <span className="max-w-[7rem] truncate" title={teamB}>{teamB}</span>
        {scoreB.length ? (
          <span className="flex shrink-0 items-center gap-1 tabular-nums" aria-label={isArabic ? "نتيجة الفريق الثاني" : "Team B set scores"}>
            {scoreB.map((score, index) => (
              <span key={index} className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-bold text-foreground shadow-sm">
                {score}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function KnockoutBracketView({
  rounds,
  isArabic,
}: {
  rounds: [number, TournamentMatch[]][];
  isArabic: boolean;
}) {
  return <KnockoutBracket rounds={rounds} isArabic={isArabic} />;
}

export function TournamentDetailsPage({
  role,
  tournamentId,
}: {
  role: "admin" | "manager" | "player";
  tournamentId: string;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isArabic = language === "ar";
  const effectiveRole = user?.role ?? role;
  const canManage = effectiveRole === "admin" || effectiveRole === "manager";
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [playerEntryMode, setPlayerEntryMode] = useState<
    "register" | "waitlist"
  >("register");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMatch, setScheduleMatch] = useState<TournamentMatch | null>(null);

  const [resultOpen, setResultOpen] = useState(false);
  const [resultMatch, setResultMatch] = useState<TournamentMatch | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [reviewTeamId, setReviewTeamId] = useState("");
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [bulkReviewMode, setBulkReviewMode] = useState<"approve" | "reject">(
    "approve",
  );
  const [selectedPendingTeamIds, setSelectedPendingTeamIds] = useState<
    string[]
  >([]);

  const [editOpen, setEditOpen] = useState(false);
  const [availableCourts, setAvailableCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [drawPreview, setDrawPreview] = useState<TournamentDrawPreview | null>(null);
  const [drawSeed, setDrawSeed] = useState<string>(`draw-${Date.now()}`);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
  const [teamImportOpen, setTeamImportOpen] = useState(false);

  const loadTournament = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTournament(tournamentId);
      setTournament(result.tournament);
    } catch (error: any) {
      toast.error(
        error?.message ||
        (isArabic ? "تعذر تحميل البطولة" : "Failed to load tournament"),
      );
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [isArabic, tournamentId]);

  const loadCourts = useCallback(async () => {
    if (!canManage) return;

    setCourtsLoading(true);
    try {
      const collected: Court[] = [];
      const seen = new Set<string>();
      let pageNumber = 1;
      let totalPages = 1;

      do {
        const result = await listCourts({ page: pageNumber, limit: 100 });
        for (const court of result.items || []) {
          if (!seen.has(court.id)) {
            seen.add(court.id);
            collected.push(court);
          }
        }
        totalPages = Math.max(1, Number(result.pagination?.pages) || 1);
        pageNumber += 1;
      } while (pageNumber <= totalPages);

      setAvailableCourts(
        collected.filter((court) => court.status === "active"),
      );
    } catch (error: any) {
      setAvailableCourts([]);
      toast.error(
        error?.message ||
        (isArabic ? "تعذر تحميل الملاعب" : "Failed to load courts"),
      );
    } finally {
      setCourtsLoading(false);
    }
  }, [canManage, isArabic]);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);


  useEffect(() => {
    setSelectedPendingTeamIds((current) =>
      current.filter((teamId) =>
        tournament?.teams?.some(
          (team) => team.id === teamId && team.status === "pending",
        ),
      ),
    );
  }, [tournament?.teams]);

  const myTeam = useMemo(
    () =>
      tournament?.teams?.find((team) => team.captainUserId === user?.id) ||
      null,
    [tournament?.teams, user?.id],
  );
  const activeMyTeam =
    myTeam && isTeamActiveStatus(myTeam.status) ? myTeam : null;
  const myWaitlistEntry = useMemo(
    () =>
      tournament?.waitlistEntries?.find(
        (entry) => entry.captainUserId === user?.id,
      ) || null,
    [tournament?.waitlistEntries, user?.id],
  );
  const waitingMyWaitlistEntry =
    myWaitlistEntry?.status === "waiting" ? myWaitlistEntry : null;

  const { groups: groupStageGroups, knockoutRounds } = useMemo(
    () => groupMatches(tournament?.matches || []),
    [tournament?.matches],
  );

  const competition = useMemo(
    () =>
      deriveCompetitionState({
        matches: tournament?.matches || [],
        teams: tournament?.teams || [],
      }),
    [tournament?.matches, tournament?.teams],
  );

  // Find champion: winner of the last knockout match
  const champion = useMemo(() => {
    if (!tournament || tournament.status !== "completed") return null;
    const knockoutMatches = (tournament.matches || []).filter(
      (m) =>
        m.stage === "knockout" && m.status === "completed" && m.winnerTeamId,
    );
    if (!knockoutMatches.length) return null;
    const finalMatch = knockoutMatches.reduce((a, b) =>
      a.roundNumber > b.roundNumber ? a : b,
    );
    return finalMatch.winnerTeamName || null;
  }, [tournament]);
  const matchFilters = useMemo(
    () => buildCompetitionFilters(tournament?.matches || [], isArabic),
    [isArabic, tournament?.matches],
  );
  const groupStandingsByGroupId = useMemo(
    () =>
      Object.fromEntries(
        competition.groupsState.map((group) => [group.groupId, group] as const),
      ),
    [competition.groupsState],
  );

  const orderedTeams = useMemo(() => {
    const items = [...(tournament?.teams || [])];
    const rank: Record<string, number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
      withdrawn: 3,
    };
    items.sort((a, b) => {
      if (a.captainUserId === user?.id) return -1;
      if (b.captainUserId === user?.id) return 1;
      return (rank[a.status] ?? 10) - (rank[b.status] ?? 10);
    });
    return items;
  }, [tournament?.teams, user?.id]);
  const pendingTeams = useMemo(
    () => (tournament?.teams || []).filter((team) => team.status === "pending"),
    [tournament?.teams],
  );
  const orderedWaitlistEntries = useMemo(() => {
    const items = [...(tournament?.waitlistEntries || [])];
    items.sort((a, b) => {
      if (a.status === "waiting" && b.status !== "waiting") return -1;
      if (a.status !== "waiting" && b.status === "waiting") return 1;
      const aPosition =
        typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPosition =
        typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      if (aPosition !== bPosition) return aPosition - bPosition;
      return (
        new Date(String(a.createdAt || 0)).getTime() -
        new Date(String(b.createdAt || 0)).getTime()
      );
    });
    return items;
  }, [tournament?.waitlistEntries]);
  const nextWaitingWaitlistEntry =
    orderedWaitlistEntries.find((entry) => entry.status === "waiting") || null;
  const selectedBulkTeams = useMemo(
    () =>
      pendingTeams.filter((team) => selectedPendingTeamIds.includes(team.id)),
    [pendingTeams, selectedPendingTeamIds],
  );

  const hasBracket = (tournament?.matches?.length || 0) > 0;
  const hasScheduledOrCompletedMatches = (tournament?.matches || []).some(
    (match) => ["scheduled", "completed"].includes(match.status),
  );
  const allMatchesCompleted =
    (tournament?.matches || []).length > 0 &&
    (tournament?.matches || []).every((match) => match.status === "completed");
  const activeTeamsCount = (tournament?.teams || []).filter((team) =>
    isTeamActiveStatus(team.status),
  ).length;
  const pendingTeamsCount = (tournament?.teams || []).filter(
    (team) => team.status === "pending",
  ).length;
  const approvedTeamsCount = tournament?.stats?.approvedTeams || 0;
  const waitingWaitlistCount = tournament?.stats?.waitlistCount || 0;
  const rejectedTeamsCount = (tournament?.teams || []).filter(
    (team) => team.status === "rejected",
  ).length;
  const withdrawnTeamsCount = (tournament?.teams || []).filter(
    (team) => team.status === "withdrawn",
  ).length;
  const scheduledMatchesCount = (tournament?.matches || []).filter(
    (match) => match.status === "scheduled",
  ).length;
  const remainingMatchesCount = Math.max(
    0,
    (tournament?.stats?.totalMatches || 0) -
    (tournament?.stats?.completedMatches || 0),
  );

  const nowMs = Date.now();
  const registrationOpenAtMs = toMs(tournament?.registrationOpenAt);
  const registrationCloseAtMs = toMs(tournament?.registrationCloseAt);
  const tournamentStartMs = toMs(tournament?.startDate);

  const registrationNotYetOpen =
    tournament?.status !== "registration_open" &&
    registrationOpenAtMs != null &&
    registrationOpenAtMs > nowMs;
  const registrationClosedByTime =
    registrationCloseAtMs != null && registrationCloseAtMs < nowMs;
  const tournamentHasStarted =
    tournamentStartMs != null && tournamentStartMs <= nowMs;
  const isFull = tournament ? activeTeamsCount >= tournament.maxTeams : false;
  const terminalTournament = ["completed", "cancelled"].includes(
    tournament?.status || "",
  );
  const remainingSpots = tournament
    ? Math.max(0, tournament.maxTeams - activeTeamsCount)
    : 0;
  const canPromoteNextWaitlist =
    canManage &&
    Boolean(nextWaitingWaitlistEntry) &&
    activeTeamsCount < (tournament?.maxTeams || 0) &&
    !terminalTournament &&
    !hasBracket &&
    !tournamentHasStarted;
  const nextStepSummary = tournament
    ? getTournamentNextStepSummary({
      tournament,
      canManage,
      isArabic,
      myTeamStatus: myTeam?.status || null,
      myWaitlistStatus: myWaitlistEntry?.status || null,
      pendingTeamsCount,
      approvedTeamsCount,
      remainingMatchesCount,
      hasBracket,
      hasScheduledOrCompletedMatches,
      registrationClosedByTime,
    })
    : null;
  const countdownInfo = useMemo(
    () =>
      tournament ? getTournamentCountdownInfo(tournament, isArabic) : null,
    [isArabic, tournament],
  );
  const timelineSteps = useMemo(
    () => (tournament ? buildTournamentTimeline(tournament, isArabic) : []),
    [isArabic, tournament],
  );
  const managerWarnings = useMemo(
    () =>
      tournament && canManage
        ? buildManagerWarnings({
          tournament,
          ar: isArabic,
          activeTeamsCount,
          pendingTeamsCount,
          approvedTeamsCount,
          waitingWaitlistCount,
          nextWaitingTeamName: nextWaitingWaitlistEntry?.teamName || null,
          remainingMatchesCount,
          hasBracket,
          hasScheduledOrCompletedMatches,
          registrationClosedByTime,
        })
        : [],
    [
      activeTeamsCount,
      approvedTeamsCount,
      canManage,
      hasBracket,
      hasScheduledOrCompletedMatches,
      isArabic,
      nextWaitingWaitlistEntry?.teamName,
      pendingTeamsCount,
      registrationClosedByTime,
      remainingMatchesCount,
      tournament,
      waitingWaitlistCount,
    ],
  );
  const activityItems = tournament?.activities || [];
  const matchDaySections = useMemo(() => {
    const matches = [...(tournament?.matches || [])];
    const now = Date.now();
    const getMatchStartMs = (match: TournamentMatch) => toMs(match.startAt) ?? Number.POSITIVE_INFINITY;
    const getMatchEndMs = (match: TournamentMatch) => toMs(match.endAt || match.startAt) ?? 0;
    const byStartAsc = (a: TournamentMatch, b: TournamentMatch) => getMatchStartMs(a) - getMatchStartMs(b);
    const byStartDesc = (a: TournamentMatch, b: TournamentMatch) => getMatchStartMs(b) - getMatchStartMs(a);
    const scheduled = matches.filter((match) => match.status === "scheduled");
    const waitingCheckIn = scheduled
      .filter((match) => Boolean(match.teamAId && match.teamBId) && (!match.teamACheckedInAt || !match.teamBCheckedInAt))
      .sort(byStartAsc);
    const readyToPlay = scheduled
      .filter((match) => Boolean(match.teamACheckedInAt && match.teamBCheckedInAt))
      .sort(byStartAsc);
    const missingResults = scheduled
      .filter((match) => {
        const endMs = getMatchEndMs(match);
        return endMs > 0 && endMs < now;
      })
      .sort(byStartAsc);
    const nextMatches = scheduled
      .filter((match) => getMatchStartMs(match) >= now)
      .sort(byStartAsc)
      .slice(0, 6);
    const recentCompleted = matches
      .filter((match) => match.status === "completed")
      .sort(byStartDesc)
      .slice(0, 6);
    return { waitingCheckIn, readyToPlay, missingResults, nextMatches, recentCompleted };
  }, [tournament?.matches]);
  const registerButtonLabel =
    myTeam?.status === "pending"
      ? isArabic
        ? "قيد المراجعة"
        : "Under review"
      : myTeam?.status === "approved"
        ? isArabic
          ? "الفريق معتمد"
          : "Team approved"
        : myTeam?.status === "rejected"
          ? isArabic
            ? "تعديل وإعادة الإرسال"
            : "Update and resubmit"
          : myTeam?.status === "withdrawn"
            ? isArabic
              ? "تسجيل من جديد"
              : "Register again"
            : isArabic
              ? "تسجيل فريق"
              : "Register team";
  const waitlistButtonLabel = waitingMyWaitlistEntry
    ? isArabic
      ? "بانتظار مقعد"
      : "Waiting for a spot"
    : isArabic
      ? "انضم إلى قائمة الانتظار"
      : "Join waitlist";
  const registerDialogTitle =
    playerEntryMode === "waitlist"
      ? waitingMyWaitlistEntry
        ? isArabic
          ? "تحديث طلب قائمة الانتظار"
          : "Update your waitlist request"
        : isArabic
          ? "الانضمام إلى قائمة الانتظار"
          : "Join the waitlist"
      : myTeam?.status === "rejected"
        ? isArabic
          ? "تعديل الفريق وإعادة الإرسال"
          : "Update and resubmit your team"
        : myTeam?.status === "withdrawn"
          ? isArabic
            ? "تسجيل الفريق من جديد"
            : "Register your team again"
          : isArabic
            ? "تسجيل فريق جديد"
            : "Register a new team";
  const registerDialogDescription =
    playerEntryMode === "waitlist"
      ? isArabic
        ? "البطولة ممتلئة حاليًا. أرسل بيانات فريقك لتأخذ مكانك في قائمة الانتظار، وسنخبرك عند توفر مقعد."
        : "The tournament is full right now. Submit your team details to hold a place on the waitlist and you will be notified if a slot opens."
      : myTeam?.status === "rejected"
        ? isArabic
          ? "تم رفض الطلب السابق. حدّث بيانات الفريق وأعد الإرسال ما دام باب التسجيل ما يزال مفتوحًا."
          : "The previous request was rejected. Update the team details and submit again while registration is still open."
        : myTeam?.status === "withdrawn"
          ? isArabic
            ? "لقد سحبت التسجيل سابقًا. يمكنك إرسال الفريق مرة أخرى ما دام باب التسجيل ما يزال مفتوحًا."
            : "You withdrew this team earlier. You can submit it again while registration is still open."
          : isArabic
            ? "أرسل اسم الفريق واسم الشريك. سيتمكن المدير من مراجعة الطلب قبل اعتماد الشجرة."
            : "Submit a team name and partner. The manager can review the registration before the bracket is finalized.";
  const playerEntrySubmitLabel =
    playerEntryMode === "waitlist" ? waitlistButtonLabel : registerButtonLabel;
  const registrationGuide = useMemo(
    () =>
      tournament
        ? getPlayerRegistrationGuide({
          tournament,
          ar: isArabic,
          myTeam,
          myWaitlistEntry,
        })
        : null,
    [isArabic, myTeam, myWaitlistEntry, tournament],
  );

  const playerCanRegisterNow =
    !canManage &&
    !activeMyTeam &&
    !waitingMyWaitlistEntry &&
    !hasBracket &&
    tournament?.status === "registration_open" &&
    !registrationNotYetOpen &&
    !registrationClosedByTime &&
    !tournamentHasStarted &&
    !isFull;

  const playerCanJoinWaitlist =
    !canManage &&
    !activeMyTeam &&
    !waitingMyWaitlistEntry &&
    !hasBracket &&
    !terminalTournament &&
    tournament?.status === "registration_open" &&
    !registrationNotYetOpen &&
    !registrationClosedByTime &&
    !tournamentHasStarted &&
    isFull;

  const playerCanLeaveWaitlist =
    !canManage &&
    Boolean(waitingMyWaitlistEntry) &&
    !terminalTournament &&
    !hasBracket &&
    !tournamentHasStarted;

  const playerCanWithdraw =
    !canManage &&
    Boolean(myTeam && ["pending", "approved"].includes(myTeam.status)) &&
    tournament?.status === "registration_open" &&
    !hasBracket &&
    !registrationNotYetOpen &&
    !registrationClosedByTime &&
    !tournamentHasStarted;

  const canPublish = canManage && tournament?.status === "draft";
  const canOpenRegistration =
    canManage &&
    ["published", "registration_closed"].includes(tournament?.status || "") &&
    !hasBracket &&
    !hasScheduledOrCompletedMatches &&
    !registrationClosedByTime &&
    !tournamentHasStarted;
  const canCloseRegistration =
    canManage && tournament?.status === "registration_open";
  const canImportTeams =
    canManage &&
    ["registration_open", "registration_closed"].includes(
      tournament?.status || "",
    ) &&
    !hasBracket &&
    !terminalTournament &&
    !tournamentHasStarted;
  const canGenerateBracket =
    canManage &&
    !hasBracket &&
    !terminalTournament &&
    !tournamentHasStarted &&
    tournament?.status === "registration_closed" &&
    !hasScheduledOrCompletedMatches &&
    pendingTeamsCount === 0 &&
    (tournament?.stats?.approvedTeams || 0) >= 2;
  const canUseDirectGenerateFallback = false;
  const canBulkReviewTeams =
    canManage &&
    ["registration_open", "registration_closed"].includes(
      tournament?.status || "",
    ) &&
    !hasBracket &&
    !tournamentHasStarted &&
    pendingTeamsCount > 0;
  const canCompleteTournament =
    canManage &&
    ["registration_closed", "in_progress"].includes(tournament?.status || "") &&
    Boolean(tournament?.winner?.id) &&
    allMatchesCompleted;
  const canCancelTournament = canManage && !terminalTournament;
  const canDeleteTournament = canManage;
  const waitlistTabVisible =
    canManage ||
    playerCanJoinWaitlist ||
    Boolean(myWaitlistEntry) ||
    waitingWaitlistCount > 0;
  const publicPageVisible = [
    "published",
    "registration_open",
    "registration_closed",
    "in_progress",
    "completed",
    "cancelled",
  ].includes(tournament?.status || "");
  const publicTournamentPath = getPublicTournamentPath(tournamentId);
  const phaseInfo = tournament ? getTournamentPhaseInfo(tournament, isArabic) : null;
  const formatSummary = tournament ? getTournamentFormatSummary(tournament, isArabic) : "";


  const selectedReviewTeam = useMemo(
    () => tournament?.teams.find((team) => team.id === reviewTeamId) || null,
    [reviewTeamId, tournament?.teams],
  );

  const isEditLocked = hasScheduledOrCompletedMatches || terminalTournament;

  const runAction = async (
    task: () => Promise<any>,
    successMessage: string,
    actionKey: string,
    options?: { reload?: boolean },
  ) => {
    setBusyAction(actionKey);
    try {
      const result = await task();
      if (result?.tournament) {
        setTournament(result.tournament);
      }
      toast.success(successMessage);
      if (options?.reload === true || (options?.reload !== false && !result?.tournament)) {
        await loadTournament();
      }
    } catch (error: any) {
      toast.error(
        error?.message || (isArabic ? "تعذر تنفيذ الإجراء" : "Action failed"),
      );
    } finally {
      setBusyAction(null);
    }
  };


  const openSchedule = (match: TournamentMatch) => {
    if (
      !match.teamAId ||
      !match.teamBId ||
      ["completed", "cancelled"].includes(match.status)
    ) {
      toast.error(
        isArabic
          ? "لا يمكن جدولة هذه المباراة في حالتها الحالية"
          : "This match cannot be scheduled in its current state",
      );
      return;
    }
    setScheduleMatch(match);
    setScheduleOpen(true);
  };

  const openResult = (match: TournamentMatch) => {
    if (!["pending", "scheduled", "completed"].includes(match.status)) {
      toast.error(
        isArabic
          ? "لا يمكن تعديل نتيجة هذه المباراة في حالتها الحالية"
          : "This match result cannot be edited in its current state",
      );
      return;
    }
    setResultMatch(match);
    setResultOpen(true);
  };

  const openReview = (
    team: Tournament["teams"][number],
    mode: "approve" | "reject",
  ) => {
    setReviewMode(mode);
    setReviewTeamId(team.id);
    setReviewOpen(true);
  };

  const togglePendingTeamSelection = (teamId: string) => {
    setSelectedPendingTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );
  };

  const toggleAllPendingTeams = () => {
    setSelectedPendingTeamIds((current) =>
      current.length === pendingTeams.length
        ? []
        : pendingTeams.map((team) => team.id),
    );
  };

  const openBulkReview = (mode: "approve" | "reject") => {
    if (selectedPendingTeamIds.length === 0) {
      toast.error(
        isArabic
          ? "اختر فريقًا واحدًا على الأقل أولًا"
          : "Select at least one pending team first",
      );
      return;
    }
    setBulkReviewMode(mode);
    setBulkReviewOpen(true);
  };

  const toggleMatchTeamCheckIn = async (
    match: TournamentMatch,
    teamId: string,
    checkedIn: boolean,
  ) => {
    await runAction(
      async () => {
        await checkInTournamentMatchTeam(tournamentId, match.id, {
          teamId,
          checkedIn,
        });
      },
      checkedIn
        ? isArabic
          ? "تم تسجيل حضور الفريق"
          : "Team checked in"
        : isArabic
          ? "تم إلغاء تسجيل الحضور"
          : "Check-in cleared",
      checkedIn ? `check-in-${teamId}` : `check-out-${teamId}`,
    );
  };

  const exportTeamsCsv = () => {
    if (!tournament) return;
    downloadCsv(
      `${tournament.title.replace(/\s+/g, "-").toLowerCase()}-teams.csv`,
      [
        [
          "Team",
          "Captain Account Name",
          "Partner",
          "Partner phone",
          "Status",
          "Latest note",
        ],
        ...(tournament.teams || []).map((team) => [
          team.teamName,
          team.captainName || "",
          team.partnerName || "",
          team.partnerPhone || "",
          team.status,
          team.notes || "",
        ]),
      ],
    );
  };

  const exportMatchesCsv = () => {
    if (!tournament) return;
    downloadCsv(
      `${tournament.title.replace(/\s+/g, "-").toLowerCase()}-matches.csv`,
      [
        [
          "Round",
          "Match",
          "Team A",
          "Team B",
          "Status",
          "Court",
          "Start",
          "End",
          "Winner",
        ],
        ...(tournament.matches || []).map((match) => [
          match.roundNumber,
          match.matchNumber,
          match.teamAName || "",
          match.teamBName || "",
          match.status,
          match.courtName || "",
          match.startAt ? formatDate(match.startAt, false) : "",
          match.endAt ? formatDate(match.endAt, false) : "",
          match.winnerTeamName || "",
        ]),
      ],
    );
  };

  const printBracket = () => {
    if (
      !tournament ||
      (groupStageGroups.length === 0 && knockoutRounds.length === 0) ||
      typeof window === "undefined"
    )
      return;

    const renderMatches = (matches: TournamentMatch[]) =>
      matches
        .map(
          (match) => `
          <article class="match-card">
            <div class="match-meta">
              <span>${escapeHtml(isArabic ? `مباراة ${match.matchNumber}` : `Match ${match.matchNumber}`)}</span>
              <span>${escapeHtml(match.status)}</span>
            </div>
            <div class="teams">
              <div>${escapeHtml(match.teamAName || "TBD")}</div>
              <div>${escapeHtml(match.teamBName || "TBD")}</div>
            </div>
            ${match.winnerTeamName ? `<p class="winner">${escapeHtml(isArabic ? "الفائز:" : "Winner:")} ${escapeHtml(match.winnerTeamName)}</p>` : ""}
          </article>
        `,
        )
        .join("");

    const title = isArabic
      ? tournament.titleAr || tournament.title
      : tournament.title;

    let roundsHtml = "";

    if (groupStageGroups.length > 0) {
      roundsHtml += `
        <h2>${escapeHtml(isArabic ? "دور المجموعات" : "Group Stage")}</h2>
        ${groupStageGroups
          .map(
            ([groupId, matches]) => `
          <section>
            <h3>${escapeHtml(isArabic ? `مجموعة ${groupId}` : `Group ${groupId}`)}</h3>
            <div class="match-grid">
              ${renderMatches(matches)}
            </div>
          </section>
        `,
          )
          .join("")}
      `;
    }

    if (knockoutRounds.length > 0) {
      roundsHtml += `
        <h2>${escapeHtml(isArabic ? "الأدوار الإقصائية" : "Knockout Stage")}</h2>
        ${knockoutRounds
          .map(
            ([round, matches]) => `
          <section>
            <h3>${escapeHtml(isArabic ? `الدور ${round}` : `Round ${round}`)}</h3>
            <div class="match-grid">
              ${renderMatches(matches)}
            </div>
          </section>
        `,
          )
          .join("")}
      `;
    }

    const printHtml = `
      <!doctype html>
      <html lang="${isArabic ? "ar" : "en"}" dir="${isArabic ? "rtl" : "ltr"}">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 32px; color: #18181b; background: #fff; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            h2 { margin: 32px 0 16px; font-size: 22px; }
            h3 { margin: 0 0 12px; font-size: 16px; }
            p { color: #52525b; }
            section { margin-bottom: 24px; break-inside: avoid; }
            .match-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
            .match-card { border: 1px solid #d4d4d8; border-radius: 16px; padding: 16px; break-inside: avoid; }
            .match-meta { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 12px; font-size: 12px; color: #52525b; }
            .teams { display: grid; gap: 8px; }
            .teams div { background: #f4f4f5; border-radius: 12px; padding: 10px; }
            .winner { margin: 12px 0 0; font-weight: 700; color: #18181b; }
            @media print { body { margin: 16px; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(isArabic ? "نسخة قابلة للطباعة من شجرة البطولة." : "Printable tournament bracket snapshot.")}</p>
          ${roundsHtml}
        </body>
      </html>
    `;

    const printFromWindow = (targetWindow: Window | null) => {
      if (!targetWindow) return false;
      try {
        targetWindow.document.open();
        targetWindow.document.write(printHtml);
        targetWindow.document.close();
        targetWindow.focus();
        window.setTimeout(() => targetWindow.print(), 250);
        return true;
      } catch {
        return false;
      }
    };

    const popup = window.open("", "_blank", "width=980,height=760");
    if (printFromWindow(popup)) return;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    if (printFromWindow(iframe.contentWindow)) {
      window.setTimeout(() => iframe.remove(), 1500);
      return;
    }

    iframe.remove();
    toast.error(
      isArabic ? "تعذر فتح نافذة الطباعة" : "Unable to open the print window",
    );
  };

  const copyPublicLink = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${publicTournamentPath}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(isArabic ? "تم نسخ الرابط العام" : "Public link copied");
    } catch {
      toast.error(
        isArabic ? "تعذر نسخ الرابط العام" : "Unable to copy the public link",
      );
    }
  };

  const openPlayerEntryDialog = (mode: "register" | "waitlist") => {
    setPlayerEntryMode(mode);
    setRegisterOpen(true);
  };

  const loadDrawPreview = async (seed = drawSeed) => {
    if (!tournament) return;
    setBusyAction("preview-draw");
    try {
      const result = await previewTournamentDraw(tournamentId, seed);
      setDrawPreview(result.preview);
      setDrawSeed(result.preview.drawSeed);
    } catch (error: any) {
      toast.error(error?.message || (isArabic ? "تعذر تحميل معاينة القرعة" : "Failed to load draw preview"));
    } finally {
      setBusyAction(null);
    }
  };

  const regenerateDrawPreview = async () => {
    const nextSeed = `draw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await loadDrawPreview(nextSeed);
  };

  const openBracketDrawReview = async () => {
    const bracketTab = document.querySelector('[value="bracket"]') as HTMLButtonElement | null;
    bracketTab?.click();
    await loadDrawPreview();
  };

  const moveDrawTeam = (groupId: string, teamId: string, direction: -1 | 1) => {
    setDrawPreview((current) => {
      if (!current) return current;
      const groups = current.groups.map((group) => ({ ...group, teams: [...group.teams] }));
      const fromIndex = groups.findIndex((group) => group.groupId === groupId);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= groups.length) return current;
      const teamIndex = groups[fromIndex].teams.findIndex((team) => team.id === teamId);
      if (teamIndex < 0) return current;
      const [team] = groups[fromIndex].teams.splice(teamIndex, 1);
      const targetGroup = groups[toIndex];
      if (targetGroup.teams.length >= current.teamsPerGroup) {
        const swapped = targetGroup.teams.pop();
        targetGroup.teams.push(team);
        if (swapped) groups[fromIndex].teams.push(swapped);
      } else {
        targetGroup.teams.push(team);
      }
      return { ...current, groups };
    });
  };

  const confirmDrawPreview = async () => {
    const manualGroups = drawPreview?.groups.map((group) => ({
      groupId: group.groupId,
      teamIds: group.teams.map((team) => team.id),
    }));
    await runAction(
      () => generateTournamentBracket(tournamentId, { drawSeed: drawPreview?.drawSeed || drawSeed, drawGroups: manualGroups }),
      isArabic ? "تم تأكيد القرعة وإنشاء الشجرة" : "Draw confirmed and bracket generated",
      "generate-bracket",
      { reload: true },
    );
    setDrawPreview(null);
  };

  const submitAutoSchedule = async (data: AutoScheduleFormData) => {
    await runAction(
      async () => {
        const result = await autoScheduleTournamentMatches(tournamentId, {
          startAt: data.startAt ? new Date(data.startAt).toISOString() : undefined,
          durationMinutes: Number(data.durationMinutes) || 60,
          gapMinutes: Number(data.gapMinutes) || 15,
        });
        setAutoScheduleOpen(false);
        toast.success(
          isArabic
            ? `تمت جدولة ${result.scheduledCount} مباراة تلقائيًا`
            : `${result.scheduledCount} match${result.scheduledCount === 1 ? "" : "es"} auto scheduled`,
        );
        if (result.skipped?.length) {
          toast.warning(
            isArabic
              ? `${result.skipped.length} مباراة تحتاج مراجعة يدوية`
              : `${result.skipped.length} match${result.skipped.length === 1 ? "" : "es"} still need manual scheduling`,
          );
        }
        return result;
      },
      isArabic ? "تمت الجدولة التلقائية" : "Auto schedule complete",
      "auto-schedule",
      { reload: false },
    );
  };


  const submitTeamImport = async (data: TeamImportSubmitData): Promise<TeamImportResult | null> => {
    let importResult: TeamImportResult | null = null;
    setBusyAction("team-import");
    try {
      const apiResult = await importTournamentTeams(tournamentId, {
        mode: data.mode,
        teams: data.teams,
      });
      importResult = {
        imported: apiResult.imported.length,
        waitlisted: apiResult.waitlisted.length,
        failed: apiResult.failed || [],
      };
      toast.success(isArabic ? "تم استيراد الفرق" : "Teams imported");
      const refreshed = await getTournament(tournamentId);
      setTournament(refreshed.tournament);
    } catch (error: any) {
      toast.error(
        error?.message || (isArabic ? "تعذر تنفيذ الإجراء" : "Action failed"),
      );
    } finally {
      setBusyAction(null);
    }
    return importResult;
  };

  const sendMatchReminder = async (match: TournamentMatch) => {
    await runAction(
      () => sendTournamentMatchReminder(tournamentId, match.id),
      isArabic ? "تم إرسال التذكير" : "Reminder sent",
      `reminder-${match.id}`,
    );
  };

  const submitRegistration = async (form: RegisterFormData) => {
    if (!form.teamName.trim() || !form.partnerName.trim()) {
      toast.error(
        isArabic
          ? "أدخل اسم الفريق واسم الشريك"
          : "Enter a team name and partner name",
      );
      return;
    }

    await runAction(
      async () => {
        const payload = {
          teamName: form.teamName.trim(),
          partnerName: form.partnerName.trim(),
          partnerPhone: form.partnerPhone.trim() || null,
          notes: form.notes.trim() || null,
        };
        if (playerEntryMode === "waitlist") {
          await joinTournamentWaitlist(tournamentId, payload);
        } else {
          await registerTournamentTeam(tournamentId, payload);
        }
        setRegisterOpen(false);
        setPlayerEntryMode("register");
      },
      playerEntryMode === "waitlist"
        ? isArabic
          ? "تم الانضمام إلى قائمة الانتظار"
          : "Added to waitlist"
        : isArabic
          ? "تم إرسال طلب التسجيل"
          : "Registration submitted",
      playerEntryMode === "waitlist" ? "join-waitlist" : "register",
    );
  };

  const submitWaitlistPromotion = async (entryId: string) => {
    await runAction(
      async () => {
        await promoteTournamentWaitlistEntry(tournamentId, entryId);
      },
      isArabic
        ? "تمت ترقية الفريق من قائمة الانتظار"
        : "Team promoted from waitlist",
      `promote-waitlist-${entryId}`,
    );
  };

  const submitNextWaitlistPromotion = async () => {
    if (!nextWaitingWaitlistEntry) return;

    await runAction(
      async () => {
        await promoteNextTournamentWaitlistEntry(tournamentId);
      },
      isArabic
        ? "تمت ترقية الفريق التالي من قائمة الانتظار"
        : "Next waitlist team promoted",
      "promote-waitlist-next",
    );
  };

  const removeWaitlistEntry = async (entryId: string, asPlayer = false) => {
    await runAction(
      async () => {
        await withdrawTournamentWaitlistEntry(tournamentId, entryId);
      },
      asPlayer
        ? isArabic
          ? "تم سحب طلب قائمة الانتظار"
          : "Left the waitlist"
        : isArabic
          ? "تمت إزالة الفريق من قائمة الانتظار"
          : "Team removed from waitlist",
      `${asPlayer ? "leave" : "remove"}-waitlist-${entryId}`,
    );
  };

  const submitSchedule = async (data: ScheduleFormData) => {
    if (!data.matchId || !data.courtId || !data.startAt || !data.endAt) {
      toast.error(
        isArabic ? "أكمل بيانات الجدولة" : "Complete the scheduling form",
      );
      return;
    }
    if (new Date(data.endAt).getTime() <= new Date(data.startAt).getTime()) {
      toast.error(
        isArabic
          ? "يجب أن تكون نهاية المباراة بعد بدايتها"
          : "Match end time must be after its start time",
      );
      return;
    }
    await runAction(
      async () => {
        await scheduleTournamentMatch(tournamentId, data.matchId, {
          courtId: data.courtId,
          startAt: data.startAt,
          endAt: data.endAt,
        });
        setScheduleOpen(false);
      },
      isArabic ? "تمت جدولة المباراة" : "Match scheduled",
      "schedule-match",
    );
  };

  const submitReview = async (notes: string) => {
    if (!selectedReviewTeam) return;

    await runAction(
      async () => {
        const payload = notes.trim() ? { notes: notes.trim() } : undefined;
        if (reviewMode === "approve") {
          await approveTournamentTeam(tournamentId, selectedReviewTeam.id, payload);
        } else {
          await rejectTournamentTeam(tournamentId, selectedReviewTeam.id, payload);
        }
        setReviewOpen(false);
        setReviewTeamId("");
      },
      reviewMode === "approve"
        ? isArabic ? "تمت الموافقة على الفريق" : "Team approved"
        : isArabic ? "تم رفض الفريق" : "Team rejected",
      reviewMode === "approve" ? "review-approve" : "review-reject",
    );
  };

  const submitBulkReview = async (notes: string) => {
    if (selectedPendingTeamIds.length === 0) return;

    await runAction(
      async () => {
        await bulkReviewTournamentTeams(tournamentId, {
          teamIds: selectedPendingTeamIds,
          status: bulkReviewMode === "approve" ? "approved" : "rejected",
          notes: notes.trim() || null,
        });
        setBulkReviewOpen(false);
        setSelectedPendingTeamIds([]);
      },
      bulkReviewMode === "approve"
        ? isArabic ? "تم اعتماد الفرق المحددة" : "Selected teams approved"
        : isArabic ? "تم رفض الفرق المحددة" : "Selected teams rejected",
      bulkReviewMode === "approve" ? "bulk-approve" : "bulk-reject",
    );
  };

  const submitResult = async (data: ResultFormData) => {
    if (!data.matchId || !data.winnerTeamId) {
      toast.error(isArabic ? "اختر الفريق الفائز" : "Choose the winning team");
      return;
    }

    if (data.resultType === "standard") {
      const filledSets = data.sets.filter((s) => s.a !== "" || s.b !== "");
      if (filledSets.length === 0) {
        toast.error(
          isArabic
            ? "أدخل نتيجة مجموعة واحدة على الأقل"
            : "Enter at least one set score",
        );
        return;
      }
      for (const set of filledSets) {
        if (set.a === "" || set.b === "") {
          toast.error(
            isArabic
              ? "أدخل نتيجة كاملة لكل مجموعة"
              : "Enter both scores for each set",
          );
          return;
        }
        const a = Number(set.a);
        const b = Number(set.b);
        if (!Number.isInteger(a) || a < 0 || !Number.isInteger(b) || b < 0) {
          toast.error(
            isArabic
              ? "استخدم أرقامًا صحيحة موجبة أو صفرًا لكل نتيجة"
              : "Use whole numbers greater than or equal to 0 for every score",
          );
          return;
        }
      }
    }

    await runAction(
      async () => {
        const filledSets = data.sets.filter((s) => s.a !== "" || s.b !== "");
        const result = await recordTournamentMatchResult(
          tournamentId,
          data.matchId,
          {
            winnerTeamId: data.winnerTeamId,
            score: {
              teamA: data.resultType === "standard" ? filledSets.map((s) => Number(s.a)) : [],
              teamB: data.resultType === "standard" ? filledSets.map((s) => Number(s.b)) : [],
              resultType: data.resultType,
            },
          },
        );
        setResultOpen(false);
        return result;
      },
      isArabic ? "تم حفظ النتيجة" : "Result saved",
      "record-result",
      { reload: false },
    );
  };

  const submitEdit = async (form: EditTournamentFormData) => {
    await runAction(
      async () => {
        const result = await updateTournament(tournamentId, {
          title: form.title.trim(),
          titleAr: form.titleAr.trim() || null,
          description: form.description.trim() || null,
          descriptionAr: form.descriptionAr.trim() || null,
          teamsPerGroup: Number(form.teamsPerGroup),
          maxTeams: Number(form.maxTeams),
          entryFee: form.entryFee === "" ? null : Number(form.entryFee),
          registrationOpenAt: form.registrationOpenAt
            ? toIsoFromCairoInput(form.registrationOpenAt)
            : null,
          registrationCloseAt: form.registrationCloseAt
            ? toIsoFromCairoInput(form.registrationCloseAt)
            : null,
          startDate: form.startDate ? toIsoFromCairoInput(form.startDate) : null,
          endDate: form.endDate ? toIsoFromCairoInput(form.endDate) : null,
          rules: form.rules.trim() || null,
          courtIds: form.courtIds,
        });
        setEditOpen(false);
        return result;
      },
      isArabic ? "تم تحديث البطولة" : "Tournament updated",
      "edit-tournament",
      { reload: false },
    );
  };

  const totalKnockoutRounds =
    knockoutRounds.length > 0
      ? knockoutRounds[knockoutRounds.length - 1][0]
      : 0;

  const renderGroupStandingsCard = (groupId: string) => {
    const group = groupStandingsByGroupId[groupId];
    if (!group || group.standings.length === 0) return null;

    return (
      <Card className="border-border/60 bg-background/95">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {isArabic ? `المجموعة ${groupId}` : `Group ${groupId}`}
              </CardTitle>
              <CardDescription>
                {isArabic
                  ? `${group.completedMatches} / ${group.totalMatches} مباراة مكتملة`
                  : `${group.completedMatches} / ${group.totalMatches} matches completed`}
              </CardDescription>
            </div>
            {group.isComplete ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {isArabic ? "المجموعة حُسمت" : "Group decided"}
              </Badge>
            ) : (
              <Badge variant="outline">
                {isArabic ? "الترتيب مباشر" : "Live table"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pe-4">#</th>
                  <th className="pb-2 pe-4">{isArabic ? "الفريق" : "Team"}</th>
                  <th className="pb-2 pe-4 text-center">
                    {isArabic ? "لعب" : "P"}
                  </th>
                  <th className="pb-2 pe-4 text-center">
                    {isArabic ? "ف" : "W"}
                  </th>
                  <th className="pb-2 pe-4 text-center">
                    {isArabic ? "خ" : "L"}
                  </th>
                  <th className="pb-2 pe-4 text-center">
                    {isArabic ? "نقاط" : "PTS"}
                  </th>
                  <th className="pb-2 pe-4 text-center">
                    {isArabic ? "فارق الأشواط" : "Game diff"}
                  </th>
                  <th className="pb-2 pe-4 text-center">
                    {isArabic ? "الأشواط المكتسبة" : "Games won"}
                  </th>
                  <th className="pb-2 text-center">
                    {isArabic ? "الحالة" : "Status"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.standings.map((row) => (
                  <tr
                    key={row.teamId}
                    className={cn(
                      "border-b last:border-b-0",
                      row.qualificationStatus === "qualified" ||
                        row.qualificationStatus === "leading"
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <td className="py-2 pe-4">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          row.qualificationStatus === "qualified" ||
                            row.qualificationStatus === "leading"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {row.position}
                      </span>
                    </td>
                    <td className="py-2 pe-4">{row.teamName}</td>
                    <td className="py-2 pe-4 text-center tabular-nums">
                      {row.played}
                    </td>
                    <td className="py-2 pe-4 text-center tabular-nums text-emerald-600 dark:text-emerald-400">
                      {row.wins}
                    </td>
                    <td className="py-2 pe-4 text-center tabular-nums text-rose-500 dark:text-rose-400">
                      {row.losses}
                    </td>
                    <td className="py-2 pe-4 text-center tabular-nums font-bold text-primary">
                      {row.points}
                    </td>
                    <td className="py-2 pe-4 text-center tabular-nums">
                      {row.scoreDiff >= 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                    </td>
                    <td className="py-2 pe-4 text-center tabular-nums font-bold">
                      {row.pointsScored}
                    </td>
                    <td className="py-2 text-center">
                      {row.qualificationStatus === "qualified" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          {isArabic ? "متأهل" : "Qualified"}
                        </span>
                      ) : row.qualificationStatus === "leading" ? (
                        <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                          {isArabic ? "ضمن المراكز" : "Leading"}
                        </span>
                      ) : row.qualificationStatus === "eliminated" ? (
                        <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600 dark:text-rose-400">
                          {isArabic ? "خرج" : "Eliminated"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                          {isArabic ? "يطارد" : "Chasing"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              {isArabic
                ? "الترتيب: الانتصارات · النقاط · فارق الأشواط · الأشواط المكتسبة · التصنيف"
                : "Ranking: wins · PTS · game difference · games won · seed"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDashboardMatchCard = (match: TournamentMatch) => {
    const canScheduleThisMatch =
      canManage &&
      ["pending", "scheduled"].includes(match.status) &&
      !terminalTournament &&
      Boolean(match.teamAId && match.teamBId);
    const canRecordThisMatch =
      canManage &&
      ["pending", "scheduled", "completed"].includes(match.status) &&
      !terminalTournament &&
      Boolean(match.teamAId && match.teamBId);
    const canCheckInThisMatch =
      canManage &&
      match.status === "scheduled" &&
      !terminalTournament &&
      Boolean(match.teamAId || match.teamBId);
    const matchTeams = [
      {
        id: match.teamAId,
        name: match.teamAName,
        checkedInAt: match.teamACheckedInAt,
        winner: Boolean(match.winnerTeamId && match.winnerTeamId === match.teamAId),
        scores: Array.isArray(match.scoreJson?.teamA) ? match.scoreJson.teamA : [],
      },
      {
        id: match.teamBId,
        name: match.teamBName,
        checkedInAt: match.teamBCheckedInAt,
        winner: Boolean(match.winnerTeamId && match.winnerTeamId === match.teamBId),
        scores: Array.isArray(match.scoreJson?.teamB) ? match.scoreJson.teamB : [],
      },
    ];
    const matchTitle =
      match.stage === "group"
        ? isArabic
          ? `${match.groupId ? `المجموعة ${match.groupId} · ` : ""}جولة ${match.roundNumber} · مباراة ${match.matchNumber}`
          : `${match.groupId ? `Group ${match.groupId} · ` : ""}Round ${match.roundNumber} · Match ${match.matchNumber}`
        : isArabic
          ? `${getSharedKnockoutRoundLabel(match.roundNumber, totalKnockoutRounds, true)} · مباراة ${match.matchNumber}`
          : `${getSharedKnockoutRoundLabel(match.roundNumber, totalKnockoutRounds, false)} · Match ${match.matchNumber}`;

    return (
      <Card
        key={match.id}
        className={
          canRecordThisMatch
            ? "border-amber-300/60 dark:border-amber-700/50"
            : "border-border/60"
        }
      >
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">{matchTitle}</CardTitle>
              <CardDescription>
                {match.courtName ||
                  (isArabic ? "لم يتم اختيار ملعب بعد" : "No court assigned")}
              </CardDescription>
            </div>
            <Badge className={matchStatusTone[match.status] || ""}>
              {matchStatusLabel(match.status, isArabic)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="space-y-2">
            {matchTeams.map((team, index) => {
              const teamName = team.name || (isArabic ? "سيحدد لاحقاً" : "TBD");
              return (
                <div
                  key={`${match.id}-${team.id || index}`}
                  title={teamName}
                  className={cn(
                    "rounded-2xl border p-3 transition-colors",
                    team.winner
                      ? "border-primary/35 bg-primary/10 text-foreground shadow-sm"
                      : "border-border/60 bg-muted/35 text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {team.winner ? (
                        <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <span className="h-4 w-4 shrink-0" />
                      )}
                      <p className="truncate font-medium text-foreground">
                        {teamName}
                      </p>
                    </div>
                    {team.scores.length ? (
                      <div className="flex shrink-0 items-center gap-1" aria-label={isArabic ? "نتيجة الفريق" : "Team score"}>
                        {team.scores.map((score, scoreIndex) => (
                          <span
                            key={`${match.id}-${team.id || index}-score-${scoreIndex}`}
                            className={cn(
                              "flex h-7 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold tabular-nums",
                              team.winner
                                ? "bg-primary/15 text-primary"
                                : "bg-background text-muted-foreground shadow-sm",
                            )}
                          >
                            {score}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground">
            <p className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              {formatDate(match.startAt, isArabic)}
            </p>

            {match.scoreJson ? (
              <p>
                {isArabic ? "النتيجة:" : "Result:"}{" "}
                {getMatchScoreSummary(match, isArabic)}
              </p>
            ) : null}

            {match.winnerTeamName ? (
              <p className="font-medium text-primary">
                {isArabic ? "الفائز:" : "Winner:"} {match.winnerTeamName}
              </p>
            ) : null}
          </div>

          {canScheduleThisMatch || canRecordThisMatch ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {canScheduleThisMatch ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => openSchedule(match)}
                >
                  <CalendarDays className="h-4 w-4" />
                  {match.courtId
                    ? isArabic
                      ? "إعادة الجدولة"
                      : "Reschedule"
                    : isArabic
                      ? "جدولة"
                      : "Schedule"}
                </Button>
              ) : null}

              {canRecordThisMatch ? (
                <Button
                  size="sm"
                  disabled={busyAction !== null}
                  onClick={() => openResult(match)}
                >
                  <Swords className="h-4 w-4" />
                  {match.status === "completed"
                    ? isArabic
                      ? "تعديل النتيجة"
                      : "Edit result"
                    : isArabic
                      ? "تسجيل نتيجة"
                      : "Record result"}
                </Button>
              ) : null}

              {canManage && match.status === "scheduled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => sendMatchReminder(match)}
                >
                  <Clock3 className="h-4 w-4" />
                  {isArabic ? "تذكير الفرق" : "Send reminder"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  const handleDuplicate = useCallback(() => {
    if (!tournament) return;
    setBusyAction("duplicate");
    createTournament({
      title: `${tournament.title} (Copy)`,
      titleAr: tournament.titleAr ? `${tournament.titleAr} (نسخة)` : "",
      description: tournament.description,
      descriptionAr: tournament.descriptionAr,
      teamsPerGroup: tournament.teamsPerGroup,
      maxTeams: tournament.maxTeams,
      entryFee: tournament.entryFee,
      registrationOpenAt: undefined,
      registrationCloseAt: undefined,
      startDate: undefined,
      endDate: undefined,
      rules: tournament.rules,
      courtIds: tournament.courts?.map((c) => c.id) || [],
    })
      .then((res) => {
        toast.success(
          isArabic
            ? "تم تكرار البطولة بنجاح"
            : "Tournament duplicated successfully",
        );
        router.push(
          `/dashboard/${effectiveRole}/tournaments/${res.tournament.id}`,
        );
      })
      .catch((err: any) => {
        toast.error(
          err?.message ||
          (isArabic
            ? "تعذر تكرار البطولة"
            : "Failed to duplicate tournament"),
        );
        setBusyAction(null);
      });
  }, [tournament, effectiveRole, isArabic, router]);

  if (loading) {
    return <Card className="h-64 animate-pulse bg-muted/40" />;
  }

  if (!tournament) {
    return (
      <EmptyState
        title={isArabic ? "البطولة غير متاحة" : "Tournament unavailable"}
        description={
          isArabic
            ? "تعذر العثور على البطولة المطلوبة."
            : "We could not find the requested tournament."
        }
      />
    );
  }

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <PageHeader
        title={
          isArabic ? tournament.titleAr || tournament.title : tournament.title
        }
        description={
          isArabic
            ? tournament.descriptionAr ||
            tournament.description ||
            "إدارة واضحة للبطولة من التسجيل حتى النتائج."
            : tournament.description ||
            "A clear tournament flow from registration to results."
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/${role}/tournaments`}>
                {isArabic ? "→ رجوع" : "← Back"}
              </Link>
            </Button>

            {/* Utility actions dropdown */}
            {publicPageVisible || hasBracket || canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">
                      {isArabic ? "إجراءات إضافية" : "More actions"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {publicPageVisible ? (
                    <>
                      <DropdownMenuItem onClick={() => setShareOpen(true)}>
                        <Share2 className="me-2 h-4 w-4" />
                        {isArabic ? "مشاركة البطولة" : "Share tournament"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={copyPublicLink}>
                        <Link2 className="me-2 h-4 w-4" />
                        {isArabic ? "نسخ الرابط العام" : "Copy public link"}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={publicTournamentPath} target="_blank">
                          <ExternalLink className="me-2 h-4 w-4" />
                          {isArabic ? "الصفحة العامة" : "Public page"}
                        </Link>
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {hasBracket ? (
                    <>
                      {publicPageVisible ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem onClick={printBracket}>
                        <Printer className="me-2 h-4 w-4" />
                        {isArabic ? "طباعة الشجرة" : "Print bracket"}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {canManage ? (
                    <>
                      <DropdownMenuItem onClick={() => setEditOpen(true)}>
                        <Pencil className="me-2 h-4 w-4" />
                        {isArabic ? "تعديل الإعدادات" : "Edit settings"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDuplicate}>
                        <Copy className="me-2 h-4 w-4" />
                        {isArabic ? "تكرار البطولة" : "Duplicate tournament"}
                      </DropdownMenuItem>
                      {publicPageVisible || hasBracket ? (
                        <DropdownMenuSeparator />
                      ) : null}
                      <DropdownMenuItem onClick={exportTeamsCsv}>
                        <Download className="me-2 h-4 w-4" />
                        {isArabic ? "تصدير الفرق CSV" : "Export teams CSV"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportMatchesCsv}>
                        <Download className="me-2 h-4 w-4" />
                        {isArabic
                          ? "تصدير المباريات CSV"
                          : "Export matches CSV"}
                      </DropdownMenuItem>

                      {canCancelTournament || canDeleteTournament ? (
                        <DropdownMenuSeparator />
                      ) : null}
                      {canCancelTournament ? (
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10"
                          onClick={() => setCancelOpen(true)}
                        >
                          <XCircle className="me-2 h-4 w-4" />
                          {isArabic ? "إلغاء البطولة" : "Cancel tournament"}
                        </DropdownMenuItem>
                      ) : null}
                      {canDeleteTournament ? (
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10"
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Trash2 className="me-2 h-4 w-4" />
                          {isArabic ? "حذف البطولة" : "Delete tournament"}
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {canManage ? (
              <>
                <EditTournamentDialog
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  tournament={tournament}
                  availableCourts={availableCourts}
                  courtsLoading={courtsLoading}
                  effectiveRole={effectiveRole}
                  activeTeamsCount={activeTeamsCount}
                  isLocked={isEditLocked}
                  isArabic={isArabic}
                  busyAction={busyAction}
                  onSubmit={submitEdit}
                />

                {canPublish ? (
                  <Button
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => publishTournament(tournamentId),
                        isArabic ? "تم نشر البطولة" : "Tournament published",
                        "publish",
                      )
                    }
                  >
                    {busyAction === "publish" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isArabic ? "نشر" : "Publish"}
                  </Button>
                ) : null}

                {canOpenRegistration ? (
                  <Button
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => openTournamentRegistration(tournamentId),
                        isArabic ? "فُتح التسجيل" : "Registration opened",
                        "open-registration",
                      )
                    }
                  >
                    {busyAction === "open-registration" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isArabic ? "فتح التسجيل" : "Open registration"}
                  </Button>
                ) : null}

                {canCloseRegistration ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => closeTournamentRegistration(tournamentId),
                        isArabic ? "أُغلق التسجيل" : "Registration closed",
                        "close-registration",
                      )
                    }
                  >
                    {busyAction === "close-registration" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isArabic ? "إغلاق التسجيل" : "Close registration"}
                  </Button>
                ) : null}

                {canGenerateBracket ? (
                  <Button size="sm" disabled={busyAction !== null} onClick={openBracketDrawReview}>
                    {busyAction === "preview-draw" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Swords className="h-4 w-4" />
                    )}
                    {isArabic ? "معاينة القرعة" : "Preview draw"}
                  </Button>
                ) : null}

                {canUseDirectGenerateFallback && canGenerateBracket ? (
                  <Button
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={openBracketDrawReview}
                  >
                    {busyAction === "preview-draw" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isArabic ? "مراجعة القرعة" : "Review draw"}
                  </Button>
                ) : null}

                {canUseDirectGenerateFallback && canGenerateBracket ? (
                  <Button
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => generateTournamentBracket(tournamentId, { drawSeed }),
                        isArabic ? "تم إنشاء الشجرة" : "Bracket generated",
                        "generate-bracket",
                        { reload: true },
                      )
                    }
                  >
                    {busyAction === "generate-bracket" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isArabic ? "إنشاء الشجرة" : "Generate bracket"}
                  </Button>
                ) : null}

                {canCompleteTournament ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => completeTournament(tournamentId),
                        isArabic
                          ? "اكتملت البطولة"
                          : "Tournament marked completed",
                        "complete",
                      )
                    }
                  >
                    {busyAction === "complete" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {isArabic ? "إنهاء البطولة" : "Complete"}
                  </Button>
                ) : null}

                {canDeleteTournament ? (
                  <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {isArabic
                            ? "هل أنت متأكد من حذف البطولة؟"
                            : "Are you sure you want to delete this tournament?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {isArabic
                            ? "هذا الإجراء سيقوم بحذف البطولة بشكل نهائي ولن يمكن التراجع عنه. سيتم حذف جميع الفرق والمباريات والنتائج المرتبطة بها."
                            : "This action will permanently delete the tournament and cannot be undone. All associated teams, matches, and results will be lost."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {isArabic ? "إلغاء" : "Cancel"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            setBusyAction("delete");
                            deleteTournament(tournamentId)
                              .then(() => {
                                toast.success(
                                  isArabic
                                    ? "تم حذف البطولة بنجاح"
                                    : "Tournament deleted successfully",
                                );
                                router.push(
                                  `/dashboard/${effectiveRole}/tournaments`,
                                );
                              })
                              .catch((err: any) => {
                                toast.error(
                                  err?.message ||
                                  (isArabic
                                    ? "تعذر حذف البطولة"
                                    : "Failed to delete tournament"),
                                );
                                setBusyAction(null);
                                setDeleteOpen(false);
                              });
                          }}
                        >
                          {busyAction === "delete" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {isArabic ? "تأكيد الحذف" : "Delete Tournament"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}

                {canCancelTournament ? (
                  <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {isArabic
                            ? "هل أنت متأكد من إلغاء البطولة؟"
                            : "Are you sure you want to cancel this tournament?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {isArabic
                            ? "سيتم إلغاء البطولة وإخطار جميع الفرق المسجلة. لا يمكن التراجع عن هذا الإجراء."
                            : "The tournament will be cancelled and all registered teams will be notified. This action cannot be undone."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {isArabic ? "تراجع" : "Go back"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            setCancelOpen(false);
                            runAction(
                              () => cancelTournament(tournamentId),
                              isArabic ? "أُلغيت البطولة" : "Tournament cancelled",
                              "cancel",
                            );
                          }}
                        >
                          {isArabic ? "تأكيد الإلغاء" : "Confirm cancellation"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </>
            ) : (
              <>
                {playerCanRegisterNow ? (
                  <Button
                    size="sm"
                    disabled={busyAction !== null}
                    onClick={() => openPlayerEntryDialog("register")}
                  >
                    {busyAction === "register" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {registerButtonLabel}
                  </Button>
                ) : null}

                <RegisterDialog
                  open={registerOpen}
                  onOpenChange={setRegisterOpen}
                  mode={playerEntryMode}
                  seed={playerEntryMode === "waitlist" ? (waitingMyWaitlistEntry ? { teamName: waitingMyWaitlistEntry.teamName, partnerName: waitingMyWaitlistEntry.partnerName || "", partnerPhone: waitingMyWaitlistEntry.partnerPhone || "", notes: waitingMyWaitlistEntry.notes || "" } : null) : (myTeam ? { teamName: myTeam.teamName, partnerName: myTeam.partnerName || "", partnerPhone: myTeam.partnerPhone || "", notes: myTeam.notes || "" } : null)}
                  dialogTitle={registerDialogTitle}
                  dialogDescription={registerDialogDescription}
                  submitLabel={playerEntrySubmitLabel}
                  registrationGuide={registrationGuide ? { title: registrationGuide.title, description: registrationGuide.description } : null}
                  isArabic={isArabic}
                  busyAction={busyAction}
                  onSubmit={submitRegistration}
                />

                <ShareDialog
                  open={shareOpen}
                  onOpenChange={setShareOpen}
                  publicTournamentPath={publicTournamentPath}
                  isArabic={isArabic}
                />

                {playerCanJoinWaitlist ? (
                  <Button
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() => openPlayerEntryDialog("waitlist")}
                  >
                    <ListOrdered className="h-4 w-4" />
                    {waitlistButtonLabel}
                  </Button>
                ) : null}

                {playerCanLeaveWaitlist && waitingMyWaitlistEntry ? (
                  <Button
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() =>
                      removeWaitlistEntry(waitingMyWaitlistEntry.id, true)
                    }
                  >
                    {isArabic ? "مغادرة قائمة الانتظار" : "Leave waitlist"}
                  </Button>
                ) : null}

                {playerCanWithdraw && myTeam ? (
                  <Button
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => withdrawTournamentTeam(tournamentId, myTeam.id),
                        isArabic ? "تم سحب التسجيل" : "Registration withdrawn",
                        "withdraw",
                      )
                    }
                  >
                    {isArabic ? "سحب التسجيل" : "Withdraw"}
                  </Button>
                ) : null}
              </>
            )}
          </>
        }
      />

      <div className="rounded-2xl border bg-muted/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {phaseInfo ? <Badge className={phaseInfo.tone}>{phaseInfo.label}</Badge> : null}
              {playerCanJoinWaitlist || waitingWaitlistCount > 0 ? (
                <Badge variant="outline">
                  {isArabic ? "قائمة الانتظار متاحة" : "Waitlist open"}
                </Badge>
              ) : null}
              {tournament.winner?.teamName ? (
                <Badge variant="outline">
                  {isArabic ? "الفائز:" : "Winner:"}{" "}
                  {tournament.winner.teamName}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? getTournamentProgressText(tournament, isArabic)
                : getPlayerRegistrationMessage(
                  tournament,
                  isArabic,
                  myTeam?.status || null,
                  myWaitlistEntry?.status || null,
                )}
            </p>
            {phaseInfo ? (
              <p className="text-sm font-medium text-foreground">
                {phaseInfo.description} · {formatSummary}
              </p>
            ) : null}
          </div>

          <div className="text-sm text-muted-foreground">
            {isArabic ? "الملاعب:" : "Courts:"}{" "}
            {(tournament.courts || [])
              .map((court) =>
                isArabic ? court.name : court.nameEn || court.name,
              )
              .filter(Boolean)
              .join(" • ") || "-"}
          </div>
        </div>
      </div>

      <Card className="border-primary/15 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            {isArabic ? "قواعد كأس العالم" : "World Cup rules"}
          </CardTitle>
          <CardDescription>
            {isArabic
              ? "نظام البطولة واضح للاعبين والمديرين قبل إنشاء الشجرة وتسجيل النتائج."
              : "The tournament rules are visible before the draw and while results are recorded."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <div className="rounded-xl bg-background/70 p-3">
            <p className="font-semibold text-foreground">{isArabic ? "التأهل" : "Qualification"}</p>
            <p className="mt-1">{isArabic ? "أفضل فريقين من كل مجموعة يتأهلان إلى الإقصائيات." : "The top two teams from each group qualify into the knockout stage."}</p>
          </div>
          <div className="rounded-xl bg-background/70 p-3">
            <p className="font-semibold text-foreground">{isArabic ? "كسر التعادل" : "Tie-breakers"}</p>
            <ol className="mt-1 list-decimal space-y-1 ps-5">
              {(isArabic
                ? getRankingRulesText(true)
                : getRankingRulesText(false)
              ).map((rule) => <li key={rule}>{rule}</li>)}
            </ol>
          </div>
          <div className="rounded-xl bg-background/70 p-3">
            <p className="font-semibold text-foreground">{isArabic ? "تسجيل النتائج" : "Score policy"}</p>
            <p className="mt-1">{getScorePolicyText(isArabic)}</p>
          </div>
        </CardContent>
      </Card>

      {!canManage && registrationGuide ? (
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertTitle>{registrationGuide.title}</AlertTitle>
          <AlertDescription>
            <p>{registrationGuide.description}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
              {registrationGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {canManage && isEditLocked ? (
        <Alert className="border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{isArabic ? "تم قفل هيكل البطولة" : "Tournament structure is locked"}</AlertTitle>
          <AlertDescription>
            {isArabic
              ? "تم جدولة مباراة أو تسجيل نتيجة، لذلك لا يمكن تغيير عدد الفرق أو نظام المجموعات أو الملاعب الأساسية."
              : "A match has been scheduled or scored, so max teams, group format, core dates, and assigned courts are protected from structural changes."}
          </AlertDescription>
        </Alert>
      ) : null}

      {countdownInfo ? (
        <div
          className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 ${countdownInfo.tone}`}
        >
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">{countdownInfo.label}</p>
            <p className="text-xl font-bold tabular-nums">
              {countdownInfo.value}
            </p>
          </div>
          <p className="text-xs opacity-80">{countdownInfo.note}</p>
        </div>
      ) : null}
      {/* Compact stats row — always visible above tabs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {isArabic ? "فرق معتمدة" : "Approved teams"}
          </p>
          <p className="mt-1 text-2xl font-bold">
            {tournament.stats?.approvedTeams || 0}
            <span className="ms-1 text-sm font-normal text-muted-foreground">
              / {tournament.maxTeams}
            </span>
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {isArabic ? "إجمالي المباريات" : "Total matches"}
          </p>
          <p className="mt-1 text-2xl font-bold">
            {tournament.stats?.totalMatches || 0}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {isArabic ? "مباريات مكتملة" : "Completed"}
          </p>
          <p className="mt-1 text-2xl font-bold">
            {tournament.stats?.completedMatches || 0}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {isArabic ? "قيد المراجعة" : "Pending review"}
          </p>
          <p className="mt-1 text-2xl font-bold">{pendingTeamsCount}</p>
        </div>
      </div>

      <Tabs
        defaultValue="overview"
        dir={isArabic ? "rtl" : "ltr"}
        className="space-y-6"
      >
        {/* ── Sticky tab bar ────────────────────────────────────────────── */}
        <div className="sticky top-[76px] z-40 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 bg-background/95 supports-[backdrop-filter]:bg-background/85 backdrop-blur-md border-b border-border/60">
          <div className="overflow-x-auto no-scrollbar py-2">
            <TabsList className="flex h-auto w-full min-w-max items-center justify-start gap-1 bg-transparent p-0">
              {(
                [
                  { value: "overview",   en: "Overview",   ar: "نظرة عامة", icon: LayoutDashboard },
                  { value: "teams",      en: "Teams",      ar: "الفرق", icon: Users },
                  ...(waitlistTabVisible
                    ? [{ value: "waitlist",  en: "Waitlist",   ar: "قائمة الانتظار", icon: ListOrdered }]
                    : []),
                  { value: "bracket",    en: "Bracket",    ar: "شجرة البطولة", icon: Trophy },
                  { value: "matches",    en: "Matches",    ar: "المباريات", icon: Swords },
                  { value: "match-day",  en: "Match day",  ar: "يوم المباريات", icon: CalendarDays },
                  { value: "activity",   en: "Updates",    ar: "التحديثات", icon: Activity },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="group relative flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-primary/30 data-[state=active]:shadow-none"
                >
                  <tab.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110 group-data-[state=active]:scale-110" />
                  <span className="relative">
                    {isArabic ? tab.ar : tab.en}
                  </span>
                  {/* Active Indicator dot */}
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary opacity-0 transition-opacity duration-200 data-[active=true]:opacity-100 group-data-[state=active]:opacity-100" />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-4">
          {/* Champion banner */}
          {champion ? (
            <Card className="border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/40 dark:to-amber-950/40">
              <CardContent className="flex items-center gap-4 py-5">
                <span className="text-5xl">🏆</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-yellow-600 dark:text-yellow-400">
                    {isArabic ? "بطل البطولة" : "Tournament Champion"}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-yellow-800 dark:text-yellow-200">
                    {champion}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Next action card (manager only) */}
          {canManage && nextStepSummary && !champion
            ? (() => {
              const isBracketReady =
                !hasBracket && tournament.status === "registration_closed";
              const isInProgress = tournament.status === "in_progress";
              const iconEl = isBracketReady
                ? "⚡"
                : isInProgress
                  ? "🎯"
                  : "📋";
              const colorClass = isBracketReady
                ? "border-violet-400/60 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40"
                : isInProgress
                  ? "border-blue-400/60 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40"
                  : "border-border bg-muted/30";
              const textColor = isBracketReady
                ? "text-violet-700 dark:text-violet-300"
                : isInProgress
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-foreground";
              return (
                <Card className={`border-2 shadow-sm ${colorClass}`}>
                  <CardContent className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <span className="mt-0.5 text-3xl">{iconEl}</span>
                      <div className="flex-1">
                        <p
                          className={`text-xs font-semibold uppercase tracking-widest ${textColor} opacity-70`}
                        >
                          {isArabic ? "الخطوة التالية" : "Next action"}
                        </p>
                        <p className={`mt-1 text-base font-bold ${textColor}`}>
                          {nextStepSummary.title}
                        </p>
                        <p className={`mt-0.5 text-sm ${textColor} opacity-80`}>
                          {nextStepSummary.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted-foreground lg:justify-end">
                      <Badge variant="outline">
                        {isArabic
                          ? `${approvedTeamsCount} / ${tournament.maxTeams} معتمدة`
                          : `${approvedTeamsCount} / ${tournament.maxTeams} approved`}
                      </Badge>
                      {hasBracket ? (
                        <Badge variant="outline">
                          {isArabic
                            ? `${remainingMatchesCount} مباريات متبقية`
                            : `${remainingMatchesCount} matches remaining`}
                        </Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })()
            : null}

          {/* Manager warnings / health checks */}
          {canManage && managerWarnings.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isArabic ? "تنبيهات الإدارة" : "Manager health checks"}
              </p>
              <div className="grid gap-2">
                {managerWarnings.map((warning) => (
                  <div
                    key={`${warning.title}-${warning.description}`}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${warning.tone === "warning"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : warning.tone === "success"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-sky-500/20 bg-sky-500/5"
                      }`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {warning.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {warning.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Player: my team status */}
          {myTeam && !canManage ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {isArabic ? "حالة فريقي" : "My team"}
                  </CardTitle>
                  <Badge className={teamStatusTone[myTeam.status] || ""}>
                    {teamStatusLabel(myTeam.status, isArabic)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5 text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">
                        {isArabic ? "اسم الفريق:" : "Team:"}
                      </span>{" "}
                      {myTeam.teamName}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        {isArabic ? "الشريك:" : "Partner:"}
                      </span>{" "}
                      {myTeam.partnerName || "-"}
                    </p>
                    {myTeam.partnerPhone ? (
                      <p>
                        <span className="font-semibold text-foreground">
                          {isArabic ? "الهاتف:" : "Phone:"}
                        </span>{" "}
                        {myTeam.partnerPhone}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground">
                      {getPlayerRegistrationMessage(
                        tournament,
                        isArabic,
                        myTeam.status,
                        myWaitlistEntry?.status || null,
                      )}
                    </p>
                    {myTeam.notes ? (
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {isArabic ? "ملاحظة:" : "Note:"}
                        </span>{" "}
                        {myTeam.notes}
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Player: my waitlist status */}
          {myWaitlistEntry &&
            !canManage &&
            (!activeMyTeam || myWaitlistEntry.status === "waiting") ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {isArabic ? "حالة قائمة الانتظار" : "My waitlist"}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {typeof myWaitlistEntry.position === "number" &&
                      myWaitlistEntry.status === "waiting" ? (
                      <Badge variant="outline">
                        {isArabic
                          ? `الدور ${myWaitlistEntry.position}`
                          : `Queue #${myWaitlistEntry.position}`}
                      </Badge>
                    ) : null}
                    <Badge
                      className={
                        waitlistStatusTone[myWaitlistEntry.status] || ""
                      }
                    >
                      {waitlistStatusLabel(myWaitlistEntry.status, isArabic)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">
                    {isArabic ? "الفريق:" : "Team:"}
                  </span>{" "}
                  {myWaitlistEntry.teamName}
                </p>
                <p>
                  <span className="font-semibold text-foreground">
                    {isArabic ? "الشريك:" : "Partner:"}
                  </span>{" "}
                  {myWaitlistEntry.partnerName || "-"}
                </p>
                <p>
                  {getPlayerRegistrationMessage(
                    tournament,
                    isArabic,
                    myTeam?.status || null,
                    myWaitlistEntry.status,
                  )}
                </p>
                {myWaitlistEntry.notes ? (
                  <p>
                    <span className="font-semibold text-foreground">
                      {isArabic ? "ملاحظة:" : "Note:"}
                    </span>{" "}
                    {myWaitlistEntry.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Tournament journey timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {isArabic ? "مسار البطولة" : "Tournament journey"}
              </CardTitle>
              <CardDescription className="text-xs">
                {tournament.status === "cancelled"
                  ? isArabic
                    ? "تم إلغاء البطولة، والتسلسل أدناه يوضح أين توقفت الرحلة."
                    : "The tournament was cancelled — the timeline shows where the flow stopped."
                  : isArabic
                    ? "كل مرحلة تصبح أوضح هنا حتى لا يحتاج اللاعب أو المدير إلى التخمين."
                    : "Each stage is visible here so players and managers never have to guess what comes next."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {timelineSteps.map((step, index) => (
                  <div
                    key={step.key}
                    className={`rounded-xl border p-3 transition-colors ${step.state === "completed"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : step.state === "current"
                        ? "border-primary/20 bg-primary/5"
                        : "border-border/60 bg-muted/20"
                      }`}
                  >
                    <p className="text-xs text-muted-foreground">
                      {isArabic ? `${index + 1}.` : `${index + 1}.`}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.state === "completed"
                        ? isArabic
                          ? "✓ اكتملت"
                          : "✓ Done"
                        : step.state === "current"
                          ? isArabic
                            ? "← الآن"
                            : "← Now"
                          : isArabic
                            ? "قادمة"
                            : "Upcoming"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Core tournament details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {isArabic ? "تفاصيل البطولة" : "Tournament details"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isArabic
                  ? "إعدادات البطولة الأساسية والمواعيد المعتمدة."
                  : "Core settings and the current operational timeline."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {isArabic ? "حالة التسجيل" : "Registration"}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground leading-tight">
                    {canManage
                      ? getTournamentProgressText(tournament, isArabic)
                      : getPlayerRegistrationMessage(
                        tournament,
                        isArabic,
                        myTeam?.status || null,
                        myWaitlistEntry?.status || null,
                      )}
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {isArabic ? "الفرق" : "Teams"}
                  </p>
                  <p className="mt-1.5 text-xl font-bold text-foreground">
                    {approvedTeamsCount}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {tournament.maxTeams}
                    </span>
                  </p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{
                        width:
                          tournament.maxTeams > 0
                            ? `${Math.min(100, (approvedTeamsCount / tournament.maxTeams) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {isArabic ? "البداية" : "Starts"}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {tournament.startDate
                      ? formatDate(tournament.startDate, isArabic)
                      : isArabic
                        ? "غير محدد"
                        : "Not set"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {tournament.endDate
                      ? formatDate(tournament.endDate, isArabic)
                      : isArabic
                        ? "نهاية غير محددة"
                        : "No end date"}
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {isArabic ? "الملاعب" : "Courts"}
                  </p>
                  <p className="mt-1.5 text-xl font-bold text-foreground">
                    {(tournament.courts || []).length}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(tournament.courts || [])
                      .map((c) => (isArabic ? c.name : c.nameEn || c.name))
                      .join(", ") || "-"}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-foreground border-b pb-2">
                    {isArabic ? "المعلومات الأساسية" : "Basic Info"}
                  </h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "المدير:" : "Manager:"}
                      </span>{" "}
                      <span>{tournament.managerName || "-"}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "النظام:" : "Format:"}
                      </span>{" "}
                      <span>
                        {isArabic
                          ? "مجموعات + خروج المغلوب · زوجي"
                          : "Group Stage + Knockout · Doubles"}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "المجموعات:" : "Groups:"}
                      </span>{" "}
                      <span>
                        {(() => {
                          const tpg = tournament.teamsPerGroup || 4;
                          const numGroups = tournament.maxTeams
                            ? Math.floor(tournament.maxTeams / tpg)
                            : 0;
                          return isArabic
                            ? `${numGroups} مجموعة · ${tpg} فرق لكل مجموعة`
                            : `${numGroups} group${numGroups !== 1 ? "s" : ""} · ${tpg} teams each`;
                        })()}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "رسوم الاشتراك:" : "Entry fee:"}
                      </span>
                      <span>
                        {tournament.entryFee != null
                          ? `${tournament.entryFee} EGP`
                          : isArabic
                            ? "بدون رسوم"
                            : "Free"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-foreground border-b pb-2">
                    {isArabic ? "الجدول الزمني" : "Timeline"}
                  </h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "فتح التسجيل:" : "Registration opens:"}
                      </span>{" "}
                      <span>
                        {formatDate(tournament.registrationOpenAt, isArabic)}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "إغلاق التسجيل:" : "Registration closes:"}
                      </span>{" "}
                      <span>
                        {formatDate(tournament.registrationCloseAt, isArabic)}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "بداية البطولة:" : "Tournament starts:"}
                      </span>{" "}
                      <span>{formatDate(tournament.startDate, isArabic)}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="font-semibold text-foreground">
                        {isArabic ? "نهاية البطولة:" : "Tournament ends:"}
                      </span>{" "}
                      <span>{formatDate(tournament.endDate, isArabic)}</span>
                    </p>
                  </div>
                </div>
              </div>

              {tournament.rules ? (
                <Accordion type="single" collapsible className="mt-4 w-full">
                  <AccordionItem
                    value="rules"
                    className="border rounded-lg px-4 bg-muted/10"
                  >
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                      {isArabic ? "القواعد والشروط" : "Rules & Conditions"}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {tournament.rules}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          {/* Capacity progress */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {isArabic ? "سعة البطولة" : "Tournament capacity"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {approvedTeamsCount} / {tournament.maxTeams}{" "}
                  {isArabic ? "فريق معتمد" : "approved"}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{
                    width:
                      tournament.maxTeams > 0
                        ? `${Math.min(100, (approvedTeamsCount / tournament.maxTeams) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {pendingTeamsCount > 0
                    ? isArabic
                      ? `${pendingTeamsCount} قيد المراجعة`
                      : `${pendingTeamsCount} pending review`
                    : isArabic
                      ? "لا يوجد طلبات معلقة"
                      : "No pending requests"}
                </span>
                <span>
                  {isArabic
                    ? `${tournament.maxTeams - approvedTeamsCount} مقعد متبقي`
                    : `${tournament.maxTeams - approvedTeamsCount} spot${tournament.maxTeams - approvedTeamsCount !== 1 ? "s" : ""} left`}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-amber-200/60 dark:border-amber-800/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    {isArabic ? "قيد المراجعة" : "Pending review"}
                  </p>
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                </div>
                <p className="mt-2 text-3xl font-bold text-amber-700 dark:text-amber-300">
                  {pendingTeamsCount}
                </p>
              </CardContent>
            </Card>
            <Card className="border-green-200/60 dark:border-green-800/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    {isArabic ? "معتمدة" : "Approved"}
                  </p>
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                </div>
                <p className="mt-2 text-3xl font-bold text-green-700 dark:text-green-300">
                  {approvedTeamsCount}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200/60 dark:border-red-800/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-red-500 dark:text-red-400">
                    {isArabic ? "مرفوضة" : "Rejected"}
                  </p>
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                </div>
                <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-300">
                  {rejectedTeamsCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {isArabic ? "منسحبة" : "Withdrawn"}
                  </p>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                </div>
                <p className="mt-2 text-3xl font-bold">{withdrawnTeamsCount}</p>
              </CardContent>
            </Card>
          </div>

          {canImportTeams ? (
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {isArabic ? "إضافة فرق للبطولة" : "Add tournament teams"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isArabic
                      ? "متاح بعد فتح التسجيل، ويبقى متاحًا بعد إغلاق التسجيل إلى أن يتم إنشاء الشجرة أو تبدأ البطولة."
                      : "Available after registration opens, and stays available after registration closes until the bracket is generated or play starts."}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setTeamImportOpen(true)} disabled={busyAction !== null}>
                  <Download className="h-4 w-4" />
                  {isArabic ? "استيراد / إضافة فرق" : "Import / add teams"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {canBulkReviewTeams ? (
            <Card className="border-border/60 bg-background/80">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {isArabic
                      ? "مراجعة الفرق المعلقة بسرعة"
                      : "Review pending teams faster"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isArabic
                      ? "اختر عدة فرق ثم اعتمدها أو ارفضها دفعة واحدة مع ملاحظة مشتركة عند الحاجة."
                      : "Select multiple pending teams and approve or reject them together with an optional shared note."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllPendingTeams}
                  >
                    {selectedPendingTeamIds.length === pendingTeams.length
                      ? isArabic
                        ? "إلغاء تحديد الكل"
                        : "Clear all"
                      : isArabic
                        ? "تحديد كل المعلق"
                        : "Select all pending"}
                  </Button>
                  <Badge variant="outline">
                    {isArabic
                      ? `المحدد: ${selectedPendingTeamIds.length}`
                      : `Selected: ${selectedPendingTeamIds.length}`}
                  </Badge>
                  <Button
                    size="sm"
                    disabled={
                      selectedPendingTeamIds.length === 0 || busyAction !== null
                    }
                    onClick={() => openBulkReview("approve")}
                  >
                    {isArabic ? "اعتماد المحدد" : "Approve selected"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      selectedPendingTeamIds.length === 0 || busyAction !== null
                    }
                    onClick={() => openBulkReview("reject")}
                  >
                    {isArabic ? "رفض المحدد" : "Reject selected"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {orderedTeams.length === 0 ? (
            <EmptyState
              title={isArabic ? "لا توجد فرق حتى الآن" : "No teams yet"}
              description={
                isArabic
                  ? "بمجرد بدء التسجيل ستظهر الفرق المسجلة هنا مع حالاتها."
                  : "Once registration starts, submitted teams and their statuses will appear here."
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orderedTeams.map((team) => (
                <Card key={team.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {team.teamName}
                        </CardTitle>
                        <CardDescription>
                          {team.captainName ||
                            (isArabic ? "قائد الفريق" : "Team captain")}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {canBulkReviewTeams && team.status === "pending" ? (
                          <Checkbox
                            checked={selectedPendingTeamIds.includes(team.id)}
                            onCheckedChange={() =>
                              togglePendingTeamSelection(team.id)
                            }
                            aria-label={
                              isArabic
                                ? `تحديد ${team.teamName}`
                                : `Select ${team.teamName}`
                            }
                          />
                        ) : null}
                        <Badge className={teamStatusTone[team.status] || ""}>
                          {teamStatusLabel(team.status, isArabic)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">
                        {isArabic ? "الشريك:" : "Partner:"}
                      </span>{" "}
                      {team.partnerName || "-"}
                    </p>

                    {team.partnerPhone ? (
                      <p>
                        <span className="font-semibold text-foreground">
                          {isArabic ? "الهاتف:" : "Phone:"}
                        </span>{" "}
                        {team.partnerPhone}
                      </p>
                    ) : null}

                    {team.notes ? (
                      <p>
                        <span className="font-semibold text-foreground">
                          {isArabic ? "آخر ملاحظة:" : "Latest note:"}
                        </span>{" "}
                        {team.notes}
                      </p>
                    ) : null}

                    {canManage &&
                      team.status === "pending" &&
                      ["registration_open", "registration_closed"].includes(
                        tournament.status,
                      ) &&
                      !hasBracket &&
                      !tournamentHasStarted ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button
                          size="sm"
                          disabled={busyAction !== null}
                          onClick={() => openReview(team, "approve")}
                        >
                          {isArabic ? "موافقة" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyAction !== null}
                          onClick={() => openReview(team, "reject")}
                        >
                          {isArabic ? "رفض" : "Reject"}
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {waitlistTabVisible ? (
          <TabsContent value="waitlist" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {isArabic ? "بانتظار مقعد" : "Waiting for a slot"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {waitingWaitlistCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {isArabic ? "المقاعد المشغولة" : "Filled slots"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {activeTeamsCount}/{tournament.maxTeams}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {isArabic ? "حالة الباب" : "Waitlist state"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {playerCanJoinWaitlist || waitingWaitlistCount > 0
                      ? isArabic
                        ? "مفتوحة"
                        : "Open"
                      : isArabic
                        ? "غير مطلوبة"
                        : "Not needed"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {isArabic ? "الخطوة التالية" : "Next move"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {canManage
                      ? activeTeamsCount < tournament.maxTeams &&
                        waitingWaitlistCount > 0
                        ? isArabic
                          ? "يمكنك ترقية الفريق التالي الآن"
                          : "You can promote the next team now"
                        : isArabic
                          ? "تابع القائمة حتى يتوفر مقعد"
                          : "Monitor the queue until a slot opens"
                      : waitingMyWaitlistEntry
                        ? isArabic
                          ? "انتظر إشعار الترقية"
                          : "Wait for a promotion update"
                        : isArabic
                          ? "انضم عند امتلاء البطولة"
                          : "Join when the tournament becomes full"}
                  </p>
                  {canManage && nextWaitingWaitlistEntry ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {isArabic ? "الفريق التالي:" : "Next in line:"}{" "}
                        <span className="font-semibold text-foreground">
                          {nextWaitingWaitlistEntry.teamName}
                        </span>
                        {typeof nextWaitingWaitlistEntry.position === "number"
                          ? isArabic
                            ? ` • الدور ${nextWaitingWaitlistEntry.position}`
                            : ` • Queue #${nextWaitingWaitlistEntry.position}`
                          : ""}
                      </p>
                      {canPromoteNextWaitlist ? (
                        <Button
                          size="sm"
                          disabled={busyAction !== null}
                          onClick={submitNextWaitlistPromotion}
                        >
                          {busyAction === "promote-waitlist-next" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {isArabic
                            ? "ترقية الفريق التالي"
                            : "Promote next in line"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {orderedWaitlistEntries.length === 0 ? (
              <EmptyState
                title={
                  isArabic
                    ? "لا توجد طلبات في قائمة الانتظار"
                    : "No waitlist entries yet"
                }
                description={
                  playerCanJoinWaitlist
                    ? isArabic
                      ? "البطولة ممتلئة حاليًا ويمكنك الانضمام إلى قائمة الانتظار من الأزرار بالأعلى."
                      : "The tournament is full right now, and you can join the waitlist using the actions above."
                    : isArabic
                      ? "ستظهر طلبات قائمة الانتظار هنا عندما تمتلئ البطولة ويبدأ اللاعبون في الانضمام."
                      : "Waitlist entries will appear here when the tournament fills up and players start joining the queue."
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {orderedWaitlistEntries.map((entry) => {
                  const canPromoteThisEntry =
                    canManage &&
                    entry.status === "waiting" &&
                    activeTeamsCount < tournament.maxTeams &&
                    !terminalTournament &&
                    !hasBracket &&
                    !tournamentHasStarted;

                  const canRemoveThisEntry =
                    canManage &&
                    entry.status === "waiting" &&
                    !terminalTournament &&
                    !hasBracket &&
                    !tournamentHasStarted;

                  return (
                    <Card key={entry.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">
                              {entry.teamName}
                            </CardTitle>
                            <CardDescription>
                              {entry.captainName ||
                                (isArabic ? "قائد الفريق" : "Team captain")}
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {typeof entry.position === "number" &&
                              entry.status === "waiting" ? (
                              <Badge variant="outline">
                                {isArabic
                                  ? `الدور ${entry.position}`
                                  : `Queue #${entry.position}`}
                              </Badge>
                            ) : null}
                            <Badge
                              className={waitlistStatusTone[entry.status] || ""}
                            >
                              {waitlistStatusLabel(entry.status, isArabic)}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>
                          <span className="font-semibold text-foreground">
                            {isArabic ? "الشريك:" : "Partner:"}
                          </span>{" "}
                          {entry.partnerName || "-"}
                        </p>
                        {entry.partnerPhone ? (
                          <p>
                            <span className="font-semibold text-foreground">
                              {isArabic ? "الهاتف:" : "Phone:"}
                            </span>{" "}
                            {entry.partnerPhone}
                          </p>
                        ) : null}
                        {entry.notes ? (
                          <p>
                            <span className="font-semibold text-foreground">
                              {isArabic ? "ملاحظة:" : "Note:"}
                            </span>{" "}
                            {entry.notes}
                          </p>
                        ) : null}
                        {entry.createdAt ? (
                          <p>
                            <span className="font-semibold text-foreground">
                              {isArabic ? "تاريخ الطلب:" : "Queued at:"}
                            </span>{" "}
                            {formatDate(entry.createdAt, isArabic)}
                          </p>
                        ) : null}

                        {canPromoteThisEntry || canRemoveThisEntry ? (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {canPromoteThisEntry ? (
                              <Button
                                size="sm"
                                disabled={busyAction !== null}
                                onClick={() =>
                                  submitWaitlistPromotion(entry.id)
                                }
                              >
                                {isArabic ? "ترقية للفِرق" : "Promote to teams"}
                              </Button>
                            ) : null}
                            {canRemoveThisEntry ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyAction !== null}
                                onClick={() => removeWaitlistEntry(entry.id)}
                              >
                                {isArabic ? "إزالة" : "Remove"}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="bracket" className="min-w-0 space-y-4 overflow-hidden">
          {canGenerateBracket ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Swords className="h-4 w-4" />
                  {isArabic ? "معاينة القرعة قبل التأكيد" : "Draw preview before confirmation"}
                </CardTitle>
                <CardDescription>
                  {isArabic
                    ? "اعرض توزيع الفرق المعتمدة على المجموعات، أعد القرعة إذا أردت، ثم أكدها لإنشاء المباريات."
                    : "Preview approved teams in groups, regenerate if needed, then confirm the draw to create matches."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busyAction !== null} onClick={() => loadDrawPreview()}>
                    {busyAction === "preview-draw" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isArabic ? "معاينة القرعة" : "Preview draw"}
                  </Button>
                  <Button variant="outline" disabled={busyAction !== null} onClick={regenerateDrawPreview}>
                    {isArabic ? "إعادة القرعة" : "Regenerate draw"}
                  </Button>
                  <Button disabled={busyAction !== null || !drawPreview} onClick={confirmDrawPreview}>
                    {busyAction === "generate-bracket" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                    {isArabic ? "تأكيد القرعة" : "Confirm draw"}
                  </Button>
                </div>

                {drawPreview ? (
                  <div className="space-y-3">
                    {drawPreview.byes > 0 ? (
                      <Alert className="border-amber-500/20 bg-amber-500/5">
                        <Info className="h-4 w-4" />
                        <AlertTitle>{isArabic ? "يوجد باي في الإقصائيات" : "Knockout byes included"}</AlertTitle>
                        <AlertDescription>
                          {isArabic
                            ? `${drawPreview.knockoutTeams} متأهلًا · ${drawPreview.byes} فرق مصنفة تحصل على باي.`
                            : `${drawPreview.knockoutTeams} qualifiers · ${drawPreview.byes} top-seed bye${drawPreview.byes === 1 ? "" : "s"}.`}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {drawPreview.groups.map((group) => (
                        <div key={group.groupId} className="rounded-2xl border bg-background/80 p-3">
                          <p className="font-semibold text-foreground">
                            {isArabic ? `المجموعة ${group.groupId}` : `Group ${group.groupId}`}
                          </p>
                          <div className="mt-2 space-y-2 text-sm">
                            {group.teams.map((team, index) => (
                              <div key={team.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-2 py-1.5">
                                <span className="min-w-0 flex-1 truncate">{team.teamName}</span>
                                <span className="text-xs text-muted-foreground">#{index + 1}</span>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    disabled={group.groupId === drawPreview.groups[0]?.groupId}
                                    onClick={() => moveDrawTeam(group.groupId, team.id, -1)}
                                  >
                                    {isArabic ? "يمين" : "←"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    disabled={group.groupId === drawPreview.groups[drawPreview.groups.length - 1]?.groupId}
                                    onClick={() => moveDrawTeam(group.groupId, team.id, 1)}
                                  >
                                    {isArabic ? "يسار" : "→"}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {canManage && !hasBracket && !terminalTournament ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <Swords className="h-10 w-10 text-muted-foreground/50" />
                <div className="max-w-md space-y-1.5">
                  <p className="font-semibold text-foreground">
                    {isArabic
                      ? "الشجرة لم تُنشأ بعد"
                      : "Bracket not generated yet"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {approvedTeamsCount >= 2
                      ? isArabic
                        ? "يوجد عدد كافٍ من الفرق المعتمدة. أغلق التسجيل إن لم يكن مغلقًا، ثم أنشئ الشجرة لرؤية مرحلة المجموعات وجميع المواجهات."
                        : "Enough approved teams exist. Close registration if still open, then generate the bracket to see the group stage and all matchups."
                      : isArabic
                        ? "اعتمد فريقين على الأقل لتفعيل إنشاء الشجرة."
                        : "Approve at least two teams to unlock bracket generation."}
                  </p>
                </div>
                {canGenerateBracket ? (
                  <Button disabled={busyAction !== null} onClick={() => loadDrawPreview()}>
                    {busyAction === "preview-draw" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Swords className="h-4 w-4" />
                    )}
                    {isArabic ? "معاينة القرعة" : "Preview draw"}
                  </Button>
                ) : null}
                {canUseDirectGenerateFallback && canGenerateBracket ? (
                  <Button
                    disabled={busyAction !== null}
                    onClick={() =>
                      runAction(
                        () => generateTournamentBracket(tournamentId, { drawSeed }),
                        isArabic ? "تم إنشاء الشجرة" : "Bracket generated",
                        "generate-bracket",
                        { reload: true },
                      )
                    }
                  >
                    {busyAction === "generate-bracket" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Swords className="h-4 w-4" />
                    )}
                    {isArabic ? "إنشاء الشجرة" : "Generate bracket"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {hasBracket && canManage
            ? (() => {
              const needsScheduling = (tournament.matches || []).filter(
                (m) => m.status === "pending" && m.teamAId && m.teamBId,
              ).length;
              const needsResult = (tournament.matches || []).filter(
                (m) => m.status === "scheduled" && m.teamAId && m.teamBId,
              ).length;
              if (!needsScheduling && !needsResult) return null;
              return (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-50/60 px-4 py-3 text-sm dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-amber-800 dark:text-amber-200">
                    {isArabic
                      ? `${needsScheduling > 0 ? `${needsScheduling} مباراة تنتظر الجدولة` : ""}${needsScheduling > 0 && needsResult > 0 ? " · " : ""}${needsResult > 0 ? `${needsResult} مباراة تنتظر تسجيل النتيجة` : ""}`
                      : `${needsScheduling > 0 ? `${needsScheduling} match${needsScheduling === 1 ? "" : "es"} awaiting scheduling` : ""}${needsScheduling > 0 && needsResult > 0 ? " · " : ""}${needsResult > 0 ? `${needsResult} match${needsResult === 1 ? "" : "es"} awaiting a result` : ""}`}
                  </p>
                  <AutoScheduleDialog
                    open={autoScheduleOpen}
                    onOpenChange={setAutoScheduleOpen}
                    isArabic={isArabic}
                    busyAction={busyAction}
                    onSubmit={submitAutoSchedule}
                  />
                  <div className="ms-auto flex items-center gap-2">
                    {needsScheduling > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyAction !== null}
                        onClick={() => setAutoScheduleOpen(true)}
                      >
                        <Swords className="h-4 w-4" />
                        {isArabic ? "جدولة تلقائية" : "Auto schedule"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const tabsTrigger = document.querySelector(
                          '[value="matches"]',
                        ) as HTMLButtonElement | null;
                        tabsTrigger?.click();
                      }}
                    >
                      {isArabic ? "انتقل إلى المباريات" : "Go to matches"}
                    </Button>
                  </div>
                </div>
              );
            })()
            : null}

          <CompetitionBoard tournament={tournament} isArabic={isArabic} />
        </TabsContent>

        <TabsContent value="matches" className="space-y-4">
          {(tournament?.matches || []).length === 0 ? (
            <EmptyState
              title={isArabic ? "لا توجد مباريات بعد" : "No matches yet"}
              description={
                isArabic
                  ? "بعد إنشاء الشجرة ستظهر المباريات هنا مع التبويبات حسب المجموعة أو الدور."
                  : "After the bracket is generated, matches will appear here with filters by group or round."
              }
            />
          ) : (
            <Tabs
              key={matchFilters.map((filter) => filter.value).join("|")}
              defaultValue="all"
              dir={isArabic ? "rtl" : "ltr"}
              className="space-y-4"
            >
              <TabsList
                className={cn(
                  "flex h-auto w-full flex-wrap gap-2 bg-transparent p-0",
                  isArabic ? "justify-end" : "justify-start",
                )}
              >
                {matchFilters.map((filter) => (
                  <TabsTrigger
                    key={filter.value}
                    value={filter.value}
                    className="h-auto flex-none rounded-full border bg-background px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {matchFilters.map((filter) => {
                const completedCount = filter.matches.filter(
                  (match) => match.status === "completed",
                ).length;

                return (
                  <TabsContent
                    key={filter.value}
                    value={filter.value}
                    className="space-y-4"
                  >
                    {filter.kind === "all" ? (
                      <div className="space-y-8">
                        {groupStageGroups.length > 0 ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold">
                                  {isArabic ? "مرحلة المجموعات" : "Group stage"}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {isArabic
                                    ? "كل مجموعة تعرض ترتيبها المباشر ثم المباريات الخاصة بها."
                                    : "Each group shows its live table first, followed by its match list."}
                                </p>
                              </div>
                              <Badge variant="outline">
                                {isArabic
                                  ? `${groupStageGroups.length} مجموعات`
                                  : `${groupStageGroups.length} groups`}
                              </Badge>
                            </div>

                            {groupStageGroups.map(([groupId, matches]) => (
                              <div
                                key={`all-group-${groupId}`}
                                className="space-y-4"
                              >
                                {renderGroupStandingsCard(groupId)}
                                <div className="grid gap-4 xl:grid-cols-2">
                                  {matches.map((match) =>
                                    renderDashboardMatchCard(match),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {knockoutRounds.length > 0 ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold">
                                  {isArabic
                                    ? "الأدوار الإقصائية"
                                    : "Knockout rounds"}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {isArabic
                                    ? "تفاصيل كل دور مع المواعيد، الحضور، النتائج، والفائز."
                                    : "Each elimination round with timing, check-in, results, and winner details."}
                                </p>
                              </div>
                              <Badge variant="outline">
                                {isArabic
                                  ? `${knockoutRounds.length} أدوار`
                                  : `${knockoutRounds.length} rounds`}
                              </Badge>
                            </div>

                            {knockoutRounds.map(([roundNumber, matches]) => (
                              <div
                                key={`all-round-${roundNumber}`}
                                className="space-y-4"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <h4 className="text-base font-semibold">
                                      {getSharedKnockoutRoundLabel(
                                        roundNumber,
                                        totalKnockoutRounds,
                                        isArabic,
                                      )}
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                      {isArabic
                                        ? `${matches.length} مباراة`
                                        : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
                                    </p>
                                  </div>
                                  <Badge variant="outline">
                                    {isArabic
                                      ? `${matches.filter((match) => match.status === "completed").length} مكتملة`
                                      : `${matches.filter((match) => match.status === "completed").length} complete`}
                                  </Badge>
                                </div>
                                <div className="grid gap-4 xl:grid-cols-2">
                                  {matches.map((match) =>
                                    renderDashboardMatchCard(match),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : filter.kind === "group" ? (
                      <div className="space-y-4">
                        {renderGroupStandingsCard(filter.groupId)}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {filter.label}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {isArabic
                                ? "ترتيب المجموعة ومبارياتها الفعلية في مكان واحد."
                                : "The live standings and all group fixtures in one place."}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {isArabic
                              ? `${completedCount} مكتملة`
                              : `${completedCount} complete`}
                          </Badge>
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                          {filter.matches.map((match) =>
                            renderDashboardMatchCard(match),
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {filter.label}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {isArabic
                                ? "كل مواجهات هذا الدور مع الجدولة والنتيجة المباشرة."
                                : "Every matchup in this round, including scheduling and live results."}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {isArabic
                              ? `${completedCount} مكتملة`
                              : `${completedCount} complete`}
                          </Badge>
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                          {filter.matches.map((match) =>
                            renderDashboardMatchCard(match),
                          )}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="match-day" className="space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>{isArabic ? "وضع يوم البطولة" : "Match day mode"}</CardTitle>
              <CardDescription>
                {isArabic
                  ? "واجهة تشغيلية مختصرة للمباريات القادمة، الحضور، والنتائج الناقصة."
                  : "A focused operations view for upcoming matches, check-ins, and missing results."}
              </CardDescription>
            </CardHeader>
          </Card>

          {matchDaySections.missingResults.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
                {isArabic ? "نتائج مطلوبة" : "Results needed"}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {matchDaySections.missingResults.map(renderDashboardMatchCard)}
              </div>
            </div>
          ) : null}

          {matchDaySections.waitingCheckIn.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-600">
                {isArabic ? "بانتظار تسجيل الحضور" : "Waiting for check-in"}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {matchDaySections.waitingCheckIn.map(renderDashboardMatchCard)}
              </div>
            </div>
          ) : null}

          {matchDaySections.readyToPlay.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
                {isArabic ? "جاهزة للعب" : "Ready to play"}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {matchDaySections.readyToPlay.map(renderDashboardMatchCard)}
              </div>
            </div>
          ) : null}

          {matchDaySections.nextMatches.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {isArabic ? "المباريات القادمة" : "Upcoming matches"}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {matchDaySections.nextMatches.map(renderDashboardMatchCard)}
              </div>
            </div>
          ) : null}

          {matchDaySections.recentCompleted.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {isArabic ? "آخر النتائج" : "Recent results"}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {matchDaySections.recentCompleted.map(renderDashboardMatchCard)}
              </div>
            </div>
          ) : null}

          {matchDaySections.missingResults.length === 0 &&
            matchDaySections.waitingCheckIn.length === 0 &&
            matchDaySections.readyToPlay.length === 0 &&
            matchDaySections.nextMatches.length === 0 &&
            matchDaySections.recentCompleted.length === 0 ? (
            <EmptyState
              title={isArabic ? "لا توجد عمليات يوم البطولة" : "No match-day actions yet"}
              description={isArabic ? "بعد جدولة المباريات ستظهر هنا المهام التشغيلية." : "Once matches are scheduled, operational tasks will appear here."}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {activityItems.length === 0 ? (
            <EmptyState
              title={isArabic ? "لا توجد تحديثات بعد" : "No updates yet"}
              description={
                isArabic
                  ? "عندما تبدأ قرارات التسجيل أو الجدولة أو النتائج بالوصول ستظهر آخر التحديثات هنا."
                  : "Recent operational updates will appear here as registration, scheduling, and results move forward."
              }
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  {isArabic ? "آخر التحديثات" : "Latest updates"}
                </CardTitle>
                <CardDescription>
                  {isArabic
                    ? "سجل مختصر يوضح ماذا حدث في البطولة ومتى حدث."
                    : "A concise history showing what changed in the tournament and when it happened."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activityItems.map((activity) => (
                  <div
                    key={activity.id}
                    className={`rounded-2xl border p-4 ${getActivityTone(activity.action)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {activity.title}
                        </p>
                        {activity.description ? (
                          <p className="text-sm text-muted-foreground">
                            {activity.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-end text-xs text-muted-foreground">
                        <p>{formatDate(activity.createdAt, isArabic)}</p>
                        {activity.actorName ? (
                          <p className="mt-1">
                            {isArabic ? "بواسطة" : "By"} {activity.actorName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <TeamImportDialog
        open={teamImportOpen}
        onOpenChange={setTeamImportOpen}
        canImportTeams={canImportTeams}
        isArabic={isArabic}
        busyAction={busyAction}
        onSubmit={submitTeamImport}
      />

      <ReviewTeamDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        team={selectedReviewTeam}
        mode={reviewMode}
        isArabic={isArabic}
        busyAction={busyAction}
        onSubmit={submitReview}
      />

      <BulkReviewDialog
        open={bulkReviewOpen}
        onOpenChange={setBulkReviewOpen}
        mode={bulkReviewMode}
        selectedTeams={(tournament?.teams ?? []).filter((t) => selectedPendingTeamIds.includes(t.id))}
        isArabic={isArabic}
        busyAction={busyAction}
        onSubmit={submitBulkReview}
      />

      <ScheduleMatchDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        match={scheduleMatch}
        tournament={tournament}
        isArabic={isArabic}
        busyAction={busyAction}
        onSubmit={submitSchedule}
      />

      <RecordResultDialog
        open={resultOpen}
        onOpenChange={setResultOpen}
        match={resultMatch}
        isArabic={isArabic}
        busyAction={busyAction}
        onSubmit={submitResult}
      />
    </div>
  );
}
