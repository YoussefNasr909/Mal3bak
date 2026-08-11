"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleDot, ExternalLink, Eye, ListChecks, Loader2, MapPin, Plus, Search, Sparkles, Trash2, Trophy, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { createEgyptDate } from "@/lib/date";
import { createTournament, deleteTournament, listCourts, listTournaments, type TournamentStatus } from "@/lib/api";
import type { Court, Tournament } from "@/lib/types";

const statusTone: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
  published: "bg-sky-500/10 text-sky-700 dark:text-sky-200",
  registration_open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  registration_closed: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  in_progress: "bg-violet-500/10 text-violet-700 dark:text-violet-200",
  completed: "bg-green-500/10 text-green-700 dark:text-green-200",
  cancelled: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

const statusOptions: Array<{ value: "all" | TournamentStatus; en: string; ar: string }> = [
  { value: "all", en: "All statuses", ar: "كل الحالات" },
  { value: "draft", en: "Draft", ar: "مسودة" },
  { value: "published", en: "Published", ar: "منشور" },
  { value: "registration_open", en: "Registration open", ar: "التسجيل مفتوح" },
  { value: "registration_closed", en: "Registration closed", ar: "التسجيل مغلق" },
  { value: "in_progress", en: "In progress", ar: "جارية" },
  { value: "completed", en: "Completed", ar: "مكتملة" },
  { value: "cancelled", en: "Cancelled", ar: "ملغية" },
];


type CreateStep = "basics" | "format" | "dates" | "courts" | "review";

const createSteps: Array<{ key: CreateStep; en: string; ar: string }> = [
  { key: "basics", en: "Basics", ar: "الأساسيات" },
  { key: "format", en: "Format & draw", ar: "النظام والقرعة" },
  { key: "dates", en: "Dates", ar: "المواعيد" },
  { key: "courts", en: "Courts", ar: "الملاعب" },
  { key: "review", en: "Review", ar: "المراجعة" },
];

const createFormatPresets = [
  { key: "mini", maxTeams: 8, teamsPerGroup: 4, en: "Mini World Cup", ar: "كأس مصغر", noteEn: "2 groups of 4, top 2 qualify", noteAr: "مجموعتان من 4 فرق، يتأهل أفضل فريقين" },
  { key: "classic", maxTeams: 16, teamsPerGroup: 4, en: "Classic World Cup", ar: "نظام كأس العالم", noteEn: "4 groups of 4, 8-team knockout", noteAr: "4 مجموعات من 4 فرق، 8 فرق في الإقصائيات" },
  { key: "major", maxTeams: 24, teamsPerGroup: 4, en: "Major Event", ar: "بطولة كبرى", noteEn: "6 groups of 4, 12 qualifiers · 4 top seeds receive byes", noteAr: "6 مجموعات من 4 فرق، 12 متأهلًا · أفضل 4 تصنيفات يحصلون على إعفاء" },
  { key: "grand", maxTeams: 32, teamsPerGroup: 4, en: "Grand Cup", ar: "كأس كبرى", noteEn: "8 groups of 4, 16-team knockout", noteAr: "8 مجموعات من 4 فرق، 16 فريقًا في الإقصائيات" },
];

const emptyCreateState = {
  title: "",
  titleAr: "",
  description: "",
  descriptionAr: "",
  teamsPerGroup: 4,
  maxTeams: 8,
  entryFee: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  startDate: "",
  endDate: "",
  rules: "",
  courtIds: [] as string[],
};

const TOURNAMENTS_PAGE_SIZE = 12;

function statusLabel(status: string, ar: boolean) {
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

function toMs(value: string | Date | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatCountdownDuration(ms: number, ar: boolean) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(ar ? `${days} يوم` : `${days}d`);
  if (hours > 0 && parts.length < 2) parts.push(ar ? `${hours} ساعة` : `${hours}h`);
  if ((parts.length === 0 || parts.length < 2) && (minutes > 0 || totalMinutes === 0)) {
    parts.push(ar ? `${minutes} دقيقة` : `${minutes}m`);
  }

  return parts.slice(0, 2).join(ar ? " و " : " ");
}

function getTournamentPhaseInfo(tournament: Tournament, ar: boolean) {
  const phase = tournament.competitionPhase;

  const map: Record<string, { label: string; tone: string; short: string }> = {
    completed: {
      label: ar ? "اكتملت البطولة" : "Tournament completed",
      tone: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-200",
      short: ar ? "منتهية" : "Completed",
    },
    cancelled: {
      label: ar ? "أُلغيت البطولة" : "Tournament cancelled",
      tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
      short: ar ? "ملغية" : "Cancelled",
    },
    final: {
      label: ar ? "النهائي قادم" : "Final upcoming",
      tone: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-200",
      short: ar ? "نهائي" : "Final",
    },
    knockout_stage: {
      label: ar ? "الأدوار الإقصائية" : "Knockout stage",
      tone: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
      short: ar ? "إقصائي" : "Knockout",
    },
    group_stage: {
      label: ar ? "دور المجموعات" : "Group stage",
      tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200",
      short: ar ? "مجموعات" : "Group stage",
    },
    draw_pending: {
      label: ar ? "التسجيل مغلق — بانتظار القرعة" : "Registration closed — bracket pending",
      tone: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-200",
      short: ar ? "بانتظار القرعة" : "Bracket pending",
    },
    registration: {
      label: ar ? "التسجيل مفتوح" : "Registration open",
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
      short: ar ? "التسجيل مفتوح" : "Registration open",
    },
    setup: {
      label: ar ? "مرحلة الإعداد" : "Setup phase",
      tone: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200",
      short: ar ? "إعداد" : "Draft",
    },
  };

  if (phase && map[phase]) return map[phase];

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

function getTournamentAccentClass(tournament: Pick<Tournament, "competitionPhase" | "status">) {
  const phase = tournament.competitionPhase || tournament.status;
  const map: Record<string, string> = {
    completed: "bg-green-500",
    cancelled: "bg-rose-500",
    final: "bg-yellow-500",
    knockout_stage: "bg-violet-500",
    group_stage: "bg-blue-500",
    draw_pending: "bg-orange-500",
    registration: "bg-emerald-500",
    registration_open: "bg-emerald-500",
    registration_closed: "bg-orange-500",
    published: "bg-sky-500",
    in_progress: "bg-violet-500",
    draft: "bg-slate-400",
    setup: "bg-slate-400",
  };

  return map[phase] || "bg-primary";
}

function getCapacityToneClass(activeTeams: number, maxTeams: number) {
  if (maxTeams > 0 && activeTeams >= maxTeams) return "bg-amber-500";
  if (maxTeams > 0 && activeTeams / maxTeams >= 0.75) return "bg-blue-500";
  return "bg-emerald-500";
}

function formatTournamentWindow(tournament: Pick<Tournament, "startDate" | "endDate">, ar: boolean) {
  const start = formatDate(tournament.startDate, ar);
  const end = tournament.endDate ? formatDate(tournament.endDate, ar) : null;
  return end ? `${start} - ${end}` : start;
}

function getTournamentFormatSummary(tournament: Pick<Tournament, "maxTeams" | "teamsPerGroup">, ar: boolean) {
  const teamsPerGroup = Number(tournament.teamsPerGroup) || 4;
  const groups = tournament.maxTeams ? Math.floor(tournament.maxTeams / teamsPerGroup) : 0;
  const knockoutTeams = groups > 0 ? groups * 2 : 0;

  return ar
    ? `${groups} مجموعة · ${teamsPerGroup} فرق لكل مجموعة · أفضل فريقين يتأهلان · ${knockoutTeams} فرق في الإقصائيات`
    : `${groups} groups of ${teamsPerGroup} · top 2 qualify · ${knockoutTeams} knockout teams`;
}

function getCreateFormatPreview(form: typeof emptyCreateState, ar: boolean) {
  const teamsPerGroup = Number(form.teamsPerGroup) || 4;
  const maxTeams = Number(form.maxTeams) || 0;
  const groups = maxTeams > 0 && teamsPerGroup > 0 ? Math.floor(maxTeams / teamsPerGroup) : 0;
  const knockoutTeams = groups * 2;

  const nextPowerOfTwo = knockoutTeams > 0 ? 2 ** Math.ceil(Math.log2(knockoutTeams)) : 0;
  const byes = Math.max(0, nextPowerOfTwo - knockoutTeams);
  const byesText = byes > 0
    ? ar
      ? ` · ${byes} إعفاء لأفضل التصنيفات`
      : ` · ${byes} top-seed byes`
    : "";

  return {
    groups,
    knockoutTeams,
    byes,
    label: ar
      ? `${maxTeams || 0} فريق · ${groups} مجموعة · ${teamsPerGroup} فرق · ${knockoutTeams} في الإقصائيات${byesText}`
      : `${maxTeams || 0} teams · ${groups} groups · ${teamsPerGroup} per group · ${knockoutTeams} in knockouts${byesText}`,
  };
}


function getCreateDrawPreview(form: typeof emptyCreateState, ar: boolean) {
  const teamsPerGroup = Number(form.teamsPerGroup) || 4;
  const maxTeams = Number(form.maxTeams) || 0;
  const groupsCount = maxTeams > 0 && teamsPerGroup > 0 ? Math.floor(maxTeams / teamsPerGroup) : 0;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  return Array.from({ length: Math.max(0, groupsCount) }, (_, groupIndex) => ({
    label: ar ? `المجموعة ${letters[groupIndex] || groupIndex + 1}` : `Group ${letters[groupIndex] || groupIndex + 1}`,
    teams: Array.from({ length: teamsPerGroup }, (_, teamIndex) =>
      ar
        ? `مقعد ${groupIndex * teamsPerGroup + teamIndex + 1}`
        : `Seed ${groupIndex * teamsPerGroup + teamIndex + 1}`,
    ),
  }));
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

function getTournamentCardCountdown(tournament: Tournament, ar: boolean) {
  const now = Date.now();
  const openAt = toMs(tournament.registrationOpenAt);
  const closeAt = toMs(tournament.registrationCloseAt);
  const startAt = toMs(tournament.startDate);
  const activeTeams = tournament.stats?.activeRegistrations
    ?? (tournament.teams || []).filter((team) => ["pending", "approved"].includes(team.status)).length;

  if (tournament.status === "published" && openAt != null && openAt > now) {
    return {
      label: ar ? "يفتح خلال" : "Opens in",
      value: formatCountdownDuration(openAt - now, ar),
      tone: "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-200",
    };
  }
  if (tournament.status === "registration_open" && closeAt != null && closeAt > now && activeTeams < tournament.maxTeams) {
    return {
      label: ar ? "يغلق خلال" : "Closes in",
      value: formatCountdownDuration(closeAt - now, ar),
      tone: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200",
    };
  }
  if (["registration_open", "registration_closed", "published"].includes(tournament.status) && startAt != null && startAt > now) {
    return {
      label: ar ? "تبدأ خلال" : "Starts in",
      value: formatCountdownDuration(startAt - now, ar),
      tone: "border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-200",
    };
  }
  return null;
}

function toIsoFromCairoInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return createEgyptDate(Number(year), Number(month), Number(day), Number(hour), Number(minute)).toISOString();
}

function getRegistrationStateText(tournament: Tournament, ar: boolean) {
  const now = Date.now();
  const startAt = tournament.startDate ? new Date(tournament.startDate).getTime() : null;
  const openAt = tournament.registrationOpenAt ? new Date(tournament.registrationOpenAt).getTime() : null;
  const closeAt = tournament.registrationCloseAt ? new Date(tournament.registrationCloseAt).getTime() : null;
  const activeTeams = tournament.stats?.activeRegistrations
    ?? (tournament.teams || []).filter((team) => ["pending", "approved"].includes(team.status)).length;

  if (["completed", "cancelled"].includes(tournament.status)) {
    return ar ? "البطولة مغلقة" : "Tournament closed";
  }
  if (tournament.status === "draft") {
    return ar ? "تحت الإعداد" : "In setup";
  }
  if (tournament.status === "published") {
    return ar ? "جاهزة لفتح التسجيل" : "Ready to open registration";
  }
  if (startAt != null && startAt <= now) {
    return ar ? "بدأت البطولة" : "Tournament started";
  }
  if (openAt != null && openAt > now) {
    return ar ? "التسجيل لم يبدأ بعد" : "Registration has not opened yet";
  }
  if (closeAt != null && closeAt < now) {
    return ar ? "أُغلق التسجيل زمنيًا" : "Registration closed by time";
  }
  if (activeTeams >= tournament.maxTeams) {
    return ar ? "اكتمل العدد" : "Tournament is full";
  }
  if (tournament.status === "registration_open") {
    return ar ? "التسجيل متاح الآن" : "Registration available now";
  }
  if (tournament.status === "registration_closed") {
    return ar ? "بانتظار إنشاء الشجرة أو المباريات" : "Waiting for bracket or match flow";
  }
  if (tournament.status === "in_progress") {
    return ar ? "المباريات جارية" : "Matches are underway";
  }
  return statusLabel(tournament.status, ar);
}

function validateCreateForm(form: typeof emptyCreateState, isArabic: boolean) {
  if (!form.title.trim()) return isArabic ? "أدخل اسم البطولة" : "Enter a tournament title";
  if (!form.courtIds.length) return isArabic ? "اختر ملعبًا واحدًا على الأقل" : "Select at least one court";

  const entryFee = form.entryFee === "" ? null : Number(form.entryFee);
  if (entryFee != null && (!Number.isFinite(entryFee) || entryFee < 0)) {
    return isArabic ? "رسوم الاشتراك يجب أن تكون رقمًا موجبًا أو صفرًا" : "Entry fee must be zero or a positive number";
  }

  const teamsPerGroup = Number(form.teamsPerGroup);
  if (!Number.isFinite(teamsPerGroup) || teamsPerGroup < 3 || teamsPerGroup > 5) {
    return isArabic ? "عدد الفرق في المجموعة يجب أن يكون بين 3 و 5" : "Teams per group must be between 3 and 5";
  }

  const maxTeams = Number(form.maxTeams);
  if (!Number.isFinite(maxTeams) || maxTeams < 4 || maxTeams > 64) {
    return isArabic ? "الحد الأقصى للفرق يجب أن يكون بين 4 و64" : "Max teams must be between 4 and 64";
  }
  if (maxTeams % teamsPerGroup !== 0) {
    return isArabic ? `الحد الأقصى للفرق يجب أن يكون من مضاعفات ${teamsPerGroup}` : `Max teams must be a multiple of ${teamsPerGroup}`;
  }

  if (!form.registrationOpenAt) return isArabic ? "حدد وقت فتح التسجيل" : "Set when registration opens";
  if (!form.registrationCloseAt) return isArabic ? "حدد وقت إغلاق التسجيل" : "Set when registration closes";
  if (!form.startDate) return isArabic ? "حدد وقت بداية البطولة" : "Set when the tournament starts";
  if (!form.endDate) return isArabic ? "حدد وقت نهاية البطولة" : "Set when the tournament ends";

  const registrationOpenAt = toIsoFromCairoInput(form.registrationOpenAt);
  const registrationCloseAt = toIsoFromCairoInput(form.registrationCloseAt);
  const startDate = toIsoFromCairoInput(form.startDate);
  const endDate = toIsoFromCairoInput(form.endDate);

  if (!registrationOpenAt) return isArabic ? "وقت فتح التسجيل غير صحيح" : "Registration open time is invalid";
  if (!registrationCloseAt) return isArabic ? "وقت إغلاق التسجيل غير صحيح" : "Registration close time is invalid";
  if (!startDate) return isArabic ? "وقت بداية البطولة غير صحيح" : "Tournament start time is invalid";
  if (!endDate) return isArabic ? "وقت نهاية البطولة غير صحيح" : "Tournament end time is invalid";

  const registrationOpenMs = registrationOpenAt ? new Date(registrationOpenAt).getTime() : null;
  const registrationCloseMs = registrationCloseAt ? new Date(registrationCloseAt).getTime() : null;
  const startDateMs = startDate ? new Date(startDate).getTime() : null;
  const endDateMs = endDate ? new Date(endDate).getTime() : null;

  if (registrationOpenMs != null && registrationCloseMs != null && registrationCloseMs < registrationOpenMs) {
    return isArabic ? "يجب أن يكون إغلاق التسجيل بعد وقت الفتح" : "Registration close must be after registration open";
  }
  if (startDateMs != null && endDateMs != null && endDateMs < startDateMs) {
    return isArabic ? "يجب أن تكون نهاية البطولة بعد البداية" : "Tournament end must be after tournament start";
  }
  if (registrationOpenMs != null && startDateMs != null && registrationOpenMs > startDateMs) {
    return isArabic ? "لا يمكن أن يفتح التسجيل بعد بداية البطولة" : "Registration cannot open after the tournament starts";
  }
  if (registrationCloseMs != null && startDateMs != null && registrationCloseMs > startDateMs) {
    return isArabic ? "لا يمكن أن يُغلق التسجيل بعد بداية البطولة" : "Registration cannot close after the tournament starts";
  }

  return null;
}

function validateCreateStep(form: typeof emptyCreateState, step: CreateStep, isArabic: boolean) {
  if (step === "basics") {
    if (!form.title.trim()) return isArabic ? "أدخل اسم البطولة" : "Enter a tournament title";
    const entryFee = form.entryFee === "" ? null : Number(form.entryFee);
    if (entryFee != null && (!Number.isFinite(entryFee) || entryFee < 0)) {
      return isArabic ? "رسوم الاشتراك يجب أن تكون رقمًا موجبًا أو صفرًا" : "Entry fee must be zero or a positive number";
    }
    return null;
  }

  if (step === "format") {
    const teamsPerGroup = Number(form.teamsPerGroup);
    const maxTeams = Number(form.maxTeams);
    if (!Number.isFinite(teamsPerGroup) || teamsPerGroup < 3 || teamsPerGroup > 5) {
      return isArabic ? "عدد الفرق في المجموعة يجب أن يكون بين 3 و 5" : "Teams per group must be between 3 and 5";
    }
    if (!Number.isFinite(maxTeams) || maxTeams < 4 || maxTeams > 64) {
      return isArabic ? "الحد الأقصى للفرق يجب أن يكون بين 4 و64" : "Max teams must be between 4 and 64";
    }
    if (maxTeams % teamsPerGroup !== 0) {
      return isArabic ? `الحد الأقصى للفرق يجب أن يكون من مضاعفات ${teamsPerGroup}` : `Max teams must be a multiple of ${teamsPerGroup}`;
    }
    return null;
  }

  if (step === "dates") {
    if (!form.registrationOpenAt) return isArabic ? "حدد وقت فتح التسجيل" : "Set when registration opens";
    if (!form.registrationCloseAt) return isArabic ? "حدد وقت إغلاق التسجيل" : "Set when registration closes";
    if (!form.startDate) return isArabic ? "حدد وقت بداية البطولة" : "Set when the tournament starts";
    if (!form.endDate) return isArabic ? "حدد وقت نهاية البطولة" : "Set when the tournament ends";

    const registrationOpenAt = toIsoFromCairoInput(form.registrationOpenAt);
    const registrationCloseAt = toIsoFromCairoInput(form.registrationCloseAt);
    const startDate = toIsoFromCairoInput(form.startDate);
    const endDate = toIsoFromCairoInput(form.endDate);

    if (!registrationOpenAt) return isArabic ? "وقت فتح التسجيل غير صحيح" : "Registration open time is invalid";
    if (!registrationCloseAt) return isArabic ? "وقت إغلاق التسجيل غير صحيح" : "Registration close time is invalid";
    if (!startDate) return isArabic ? "وقت بداية البطولة غير صحيح" : "Tournament start time is invalid";
    if (!endDate) return isArabic ? "وقت نهاية البطولة غير صحيح" : "Tournament end time is invalid";
    const registrationOpenMs = registrationOpenAt ? new Date(registrationOpenAt).getTime() : null;
    const registrationCloseMs = registrationCloseAt ? new Date(registrationCloseAt).getTime() : null;
    const startDateMs = startDate ? new Date(startDate).getTime() : null;
    const endDateMs = endDate ? new Date(endDate).getTime() : null;

    if (registrationOpenMs != null && registrationCloseMs != null && registrationCloseMs < registrationOpenMs) {
      return isArabic ? "يجب أن يكون إغلاق التسجيل بعد وقت الفتح" : "Registration close must be after registration open";
    }
    if (startDateMs != null && endDateMs != null && endDateMs < startDateMs) {
      return isArabic ? "يجب أن تكون نهاية البطولة بعد البداية" : "Tournament end must be after tournament start";
    }
    if (registrationOpenMs != null && startDateMs != null && registrationOpenMs > startDateMs) {
      return isArabic ? "لا يمكن أن يفتح التسجيل بعد بداية البطولة" : "Registration cannot open after the tournament starts";
    }
    if (registrationCloseMs != null && startDateMs != null && registrationCloseMs > startDateMs) {
      return isArabic ? "لا يمكن أن يُغلق التسجيل بعد بداية البطولة" : "Registration cannot close after the tournament starts";
    }
    return null;
  }

  if (step === "courts") {
    if (!form.courtIds.length) return isArabic ? "اختر ملعبًا واحدًا على الأقل" : "Select at least one court";
    return null;
  }

  return validateCreateForm(form, isArabic);
}


export function TournamentsPage({ role }: { role: "admin" | "manager" | "player" }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const effectiveRole = user?.role ?? role;
  const canManage = effectiveRole === "admin" || effectiveRole === "manager";

  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<"all" | TournamentStatus>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);
  const [tournamentToDelete, setTournamentToDelete] = useState<Tournament | null>(null);
  const [form, setForm] = useState(emptyCreateState);
  const [createStep, setCreateStep] = useState<CreateStep>("basics");
  const [createValidationMessage, setCreateValidationMessage] = useState("");

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTournaments({
        q: deferredQuery.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        mine: role === "player" ? mineOnly : undefined,
        page,
        limit: TOURNAMENTS_PAGE_SIZE,
        sortBy: "startDate",
        order: "asc",
      });
      setItems(result.items || []);
      setPages(Math.max(1, Number(result.pages) || 1));
      setTotalItems(Number(result.total) || 0);
    } catch (error: any) {
      toast.error(error?.message || (isArabic ? "تعذر تحميل البطولات" : "Failed to load tournaments"));
      setItems([]);
      setPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [deferredQuery, isArabic, mineOnly, page, role, statusFilter]);

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

      setCourts(collected.filter((court) => court.status === "active"));
    } catch (error: any) {
      setCourts([]);
      toast.error(error?.message || (isArabic ? "تعذر تحميل الملاعب" : "Failed to load courts"));
    } finally {
      setCourtsLoading(false);
    }
  }, [canManage, isArabic]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    if (!openCreate) {
      setForm(emptyCreateState);
      setCreateStep("basics");
      setCreateValidationMessage("");
    }
  }, [openCreate]);

  useEffect(() => {
    if (createValidationMessage) setCreateValidationMessage("");
  }, [
    createStep,
    createValidationMessage,
    form.title,
    form.titleAr,
    form.description,
    form.descriptionAr,
    form.teamsPerGroup,
    form.maxTeams,
    form.entryFee,
    form.registrationOpenAt,
    form.registrationCloseAt,
    form.startDate,
    form.endDate,
    form.rules,
    form.courtIds,
  ]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, mineOnly, statusFilter]);

  const selectedCreateManagerId = useMemo(
    () => form.courtIds.map((courtId) => courts.find((court) => court.id === courtId)?.managerId).find(Boolean) || null,
    [courts, form.courtIds],
  );
  const selectedCreateManagerName = useMemo(
    () => courts.find((court) => court.managerId && court.managerId === selectedCreateManagerId)?.managerName || null,
    [courts, selectedCreateManagerId],
  );
  const sortedCourts = useMemo(
    () =>
      [...courts].sort((a, b) =>
        effectiveRole === "admin"
          ? `${a.managerName || ""}-${a.nameEn || a.name}`.localeCompare(`${b.managerName || ""}-${b.nameEn || b.name}`)
          : (a.nameEn || a.name).localeCompare(b.nameEn || b.name),
      ),
    [courts, effectiveRole],
  );

  const selectedCreateCourts = useMemo(
    () => form.courtIds.map((courtId) => courts.find((court) => court.id === courtId)).filter(Boolean) as Court[],
    [courts, form.courtIds],
  );
  const createPreviewForm = useMemo(
    () => ({
      ...emptyCreateState,
      teamsPerGroup: form.teamsPerGroup,
      maxTeams: form.maxTeams,
    }),
    [form.teamsPerGroup, form.maxTeams],
  );
  const createFormatPreview = useMemo(() => getCreateFormatPreview(createPreviewForm, isArabic), [createPreviewForm, isArabic]);
  const createDrawPreview = useMemo(() => getCreateDrawPreview(createPreviewForm, isArabic), [createPreviewForm, isArabic]);
  const createStepIndex = createSteps.findIndex((step) => step.key === createStep);
  const canGoBackCreateStep = createStepIndex > 0;
  const canGoNextCreateStep = createStepIndex >= 0 && createStepIndex < createSteps.length - 1;

  const applyCreatePreset = (preset: (typeof createFormatPresets)[number]) => {
    setForm((current) => ({
      ...current,
      maxTeams: preset.maxTeams,
      teamsPerGroup: preset.teamsPerGroup,
    }));
  };

  const handleDeleteTournament = (tournament: Tournament) => {
    if (!canManage || deletingTournamentId) return;
    setTournamentToDelete(tournament);
  };

  const confirmDeleteTournament = async () => {
    if (!tournamentToDelete) return;
    const id = tournamentToDelete.id;
    setTournamentToDelete(null);
    setDeletingTournamentId(id);
    try {
      await deleteTournament(id);
      toast.success(isArabic ? "تم حذف البطولة" : "Tournament deleted");
      await loadTournaments();
    } catch (error: any) {
      toast.error(error?.message || (isArabic ? "تعذر حذف البطولة" : "Failed to delete tournament"));
    } finally {
      setDeletingTournamentId(null);
    }
  };

  const goToCreateStep = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= createSteps.length) return;
    if (targetIndex <= createStepIndex) {
      setCreateStep(createSteps[targetIndex].key);
      return;
    }

    for (let index = createStepIndex; index < targetIndex; index += 1) {
      const validationError = validateCreateStep(form, createSteps[index].key, isArabic);
      if (validationError) {
        toast.error(validationError);
        setCreateValidationMessage(validationError);
        setCreateStep(createSteps[index].key);
        return;
      }
    }

    setCreateValidationMessage("");
    setCreateStep(createSteps[targetIndex].key);
  };

  const goToNextCreateStep = () => {
    if (!canGoNextCreateStep) return;
    goToCreateStep(createStepIndex + 1);
  };

  const goToPreviousCreateStep = () => {
    if (!canGoBackCreateStep) return;
    setCreateStep(createSteps[createStepIndex - 1].key);
  };

  const toggleCourt = (courtId: string) => {
    setForm((current) => ({
      ...current,
      courtIds: current.courtIds.includes(courtId)
        ? current.courtIds.filter((id) => id !== courtId)
        : [...current.courtIds, courtId],
    }));
  };

  const submitCreate = async () => {
    const validationError = validateCreateForm(form, isArabic);
    if (validationError) {
      toast.error(validationError);
      setCreateValidationMessage(validationError);
      return;
    }

    setCreateLoading(true);
    try {
      await createTournament({
        title: form.title.trim(),
        titleAr: form.titleAr.trim() || null,
        description: form.description.trim() || null,
        descriptionAr: form.descriptionAr.trim() || undefined,
        teamsPerGroup: Number(form.teamsPerGroup),
        maxTeams: Number(form.maxTeams),
        entryFee: form.entryFee === "" ? null : Number(form.entryFee),
        registrationOpenAt: form.registrationOpenAt ? toIsoFromCairoInput(form.registrationOpenAt) : null,
        registrationCloseAt: form.registrationCloseAt ? toIsoFromCairoInput(form.registrationCloseAt) : null,
        startDate: form.startDate ? toIsoFromCairoInput(form.startDate) : null,
        endDate: form.endDate ? toIsoFromCairoInput(form.endDate) : null,
        rules: form.rules.trim() || null,
        courtIds: form.courtIds,
      });

      toast.success(isArabic ? "تم إنشاء البطولة" : "Tournament created");
      setOpenCreate(false);
      setForm(emptyCreateState);
      await loadTournaments();
    } catch (error: any) {
      toast.error(error?.message || (isArabic ? "تعذر إنشاء البطولة" : "Failed to create tournament"));
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <>
    <div className="space-y-5 pb-[calc(var(--mobile-bottom-nav-offset,0rem)+1rem)] md:space-y-6 md:pb-0">
      {/* Hero */}
      <AnimatedContainer animation="fade-up">
        <div className="relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-blue-50/80 p-5 shadow-sm dark:border-blue-400/20 dark:from-blue-950/25 dark:via-indigo-950/25 dark:to-blue-950/20 sm:p-6 md:p-7">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-primary to-blue-400" />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-300/60 bg-blue-500/15 text-blue-700 shadow-xs dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-normal text-slate-950 dark:text-slate-50 md:text-3xl">
                {isArabic ? "البطولات" : "Tournaments"}
              </h1>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
                {canManage
                  ? isArabic
                    ? "أنشئ البطولات، اضبط التسجيل، ثم انتقل إلى إدارة الفرق والمباريات من شاشة البطولة."
                    : "Create tournaments, control registration, then manage teams and matches from each tournament."
                  : isArabic
                    ? "استعرض البطولات المتاحة وتابع حالة تسجيل فريقك بسهولة."
                    : "Browse available tournaments and track your team registration clearly."}
              </p>
            </div>
          </div>
        </div>
      </AnimatedContainer>

      {/* Unified Card for Filters and List */}
      <AnimatedContainer animation="fade-up" delay={40}>
        <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <CardContent className="p-0">
            {/* Filter Bar */}
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 border-b border-border/5">
              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:max-w-xs relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={isArabic ? "ابحث عن بطولة..." : "Search tournaments..."}
                  className="pl-9 pr-8 w-full"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label={isArabic ? "مسح البحث" : "Clear search"}
                    title={isArabic ? "مسح البحث" : "Clear search"}
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex flex-1 sm:flex-none items-center gap-2">
                  <select
                    aria-label={isArabic ? "تصفية البطولات حسب الحالة" : "Filter tournaments by status"}
                    title={isArabic ? "تصفية حسب الحالة" : "Filter by status"}
                    className="flex-1 sm:flex-none h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as "all" | TournamentStatus)}
                  >
                    {(role === "player" ? statusOptions.filter((option) => option.value !== "draft") : statusOptions).map((option) => (
                      <option key={option.value} value={option.value}>
                        {isArabic ? option.ar : option.en}
                      </option>
                    ))}
                  </select>

                  {role === "player" ? (
                    <Button
                      className="flex-1 sm:flex-none"
                      variant={mineOnly ? "default" : "outline"}
                      onClick={() => setMineOnly((current) => !current)}
                    >
                      {mineOnly
                        ? isArabic
                          ? "عرض الكل"
                          : "Show all"
                        : isArabic
                          ? "بطولاتي"
                          : "My tournaments"}
                    </Button>
                  ) : null}
                </div>

                {canManage ? (
                  <Dialog open={openCreate} onOpenChange={setOpenCreate}>
                    <DialogTrigger asChild>
                      <Button className="shrink-0" title={isArabic ? "إنشاء بطولة" : "Create tournament"}>
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline sm:ml-2">{isArabic ? "إنشاء بطولة" : "Create tournament"}</span>
                        <span className="sm:hidden ml-1">{isArabic ? "إنشاء" : "Create"}</span>
                      </Button>
                    </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>{isArabic ? "بطولة جديدة" : "New tournament"}</DialogTitle>
                    <DialogDescription>
                      {isArabic
                        ? "اتبع خطوات سريعة لإنشاء بطولة زوجي بنظام مجموعات ثم أدوار إقصائية حتى النهائي."
                        : "Follow a guided setup for a doubles group-stage tournament with knockout finals."}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6">
                    <div className="grid gap-2 rounded-2xl border bg-muted/35 p-2 sm:grid-cols-5">
                      {createSteps.map((step, index) => {
                        const active = step.key === createStep;
                        const complete = index < createStepIndex;
                        return (
                          <button
                            key={step.key}
                            type="button"
                            onClick={() => goToCreateStep(index)}
                            className={`rounded-xl px-3 py-2 text-start text-xs transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : complete
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                                  : "text-muted-foreground hover:bg-background"
                            }`}
                          >
                            <span className="flex items-center gap-2 font-semibold">
                              {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">{index + 1}</span>}
                              {isArabic ? step.ar : step.en}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {createValidationMessage ? (
                      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive" role="alert">
                        {createValidationMessage}
                      </div>
                    ) : null}

                    {createStep === "basics" ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="create-title">{isArabic ? "اسم البطولة" : "Tournament title"}</Label>
                          <Input
                            id="create-title"
                            required
                            aria-required="true"
                            value={form.title}
                            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                            placeholder={isArabic ? "بطولة الربيع" : "Spring Cup"}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create-title-ar">{isArabic ? "الاسم بالعربية" : "Arabic title"}</Label>
                          <Input
                            id="create-title-ar"
                            value={form.titleAr}
                            onChange={(event) => setForm((current) => ({ ...current, titleAr: event.target.value }))}
                            placeholder={isArabic ? "اختياري" : "Optional"}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="create-description">{isArabic ? "الوصف" : "Description"}</Label>
                          <Textarea
                            id="create-description"
                            value={form.description}
                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder={isArabic ? "ملخص قصير وواضح للبطولة" : "A short, clear summary of the tournament"}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="create-description-ar">{isArabic ? "الوصف بالعربية" : "Arabic description"}</Label>
                          <Textarea
                            id="create-description-ar"
                            value={form.descriptionAr}
                            onChange={(event) => setForm((current) => ({ ...current, descriptionAr: event.target.value }))}
                            placeholder={isArabic ? "اختياري" : "Optional"}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create-entry-fee">{isArabic ? "رسوم الاشتراك" : "Entry fee"}</Label>
                          <Input
                            id="create-entry-fee"
                            type="number"
                            min={0}
                            value={form.entryFee}
                            onChange={(event) => setForm((current) => ({ ...current, entryFee: event.target.value }))}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ) : null}

                    {createStep === "format" ? (
                      <div className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {createFormatPresets.map((preset) => {
                            const active = preset.maxTeams === form.maxTeams && preset.teamsPerGroup === form.teamsPerGroup;
                            return (
                              <button
                                key={preset.key}
                                type="button"
                                onClick={() => applyCreatePreset(preset)}
                                className={`rounded-2xl border p-4 text-start transition-all ${active ? "border-primary bg-primary/10 text-foreground shadow-sm" : "hover:border-primary/50 hover:bg-muted/40"}`}
                              >
                                <Sparkles className="mb-3 h-4 w-4 text-primary" />
                                <p className="font-semibold">{isArabic ? preset.ar : preset.en}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{isArabic ? preset.noteAr : preset.noteEn}</p>
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor="create-max-teams">{isArabic ? "الحد الأقصى للفرق" : "Max teams"}</Label>
                            <Input
                              id="create-max-teams"
                              type="number"
                              required
                              aria-required="true"
                              min={4}
                              max={64}
                              value={form.maxTeams}
                              onChange={(event) => {
                                const val = Number(event.target.value);
                                const validSizes = [3, 4, 5].filter((s) => val % s === 0);
                                setForm((current) => ({
                                  ...current,
                                  maxTeams: val,
                                  teamsPerGroup: validSizes.includes(current.teamsPerGroup) ? current.teamsPerGroup : (validSizes[0] ?? current.teamsPerGroup),
                                }));
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="create-teams-per-group">{isArabic ? "فرق المجموعة" : "Teams per group"}</Label>
                            <select
                              id="create-teams-per-group"
                              required
                              aria-required="true"
                              aria-label={isArabic ? "عدد الفرق في كل مجموعة" : "Teams per group"}
                              title={isArabic ? "عدد الفرق في كل مجموعة" : "Teams per group"}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              value={form.teamsPerGroup}
                              onChange={(event) => setForm((current) => ({ ...current, teamsPerGroup: Number(event.target.value) }))}
                            >
                              {[3, 4, 5]
                                .filter((size) => form.maxTeams % size === 0)
                                .map((size) => (
                                  <option key={size} value={size}>
                                    {size} {isArabic ? `(سيكون ${form.maxTeams / size} مجموعات)` : `(${form.maxTeams / size} groups)`}
                                  </option>
                                ))}
                              {[3, 4, 5].filter((s) => form.maxTeams % s === 0).length === 0 && (
                                <option disabled>{isArabic ? "اختر عدد فرق صحيح" : "Enter a valid max teams first"}</option>
                              )}
                            </select>
                          </div>
                          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
                            <p className="font-semibold text-foreground">{isArabic ? "ملخص النظام" : "Format summary"}</p>
                            <p className="mt-1 text-muted-foreground">{createFormatPreview.label}</p>
                          </div>
                        </div>

                        <div className="rounded-2xl border bg-muted/35 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{isArabic ? "معاينة القرعة" : "Draw preview"}</p>
                              <p className="text-sm text-muted-foreground">
                                {isArabic
                                  ? "هذه معاينة للمقاعد قبل اعتماد الفرق. يمكن تغيير النظام قبل إنشاء الشجرة أو جدولة المباريات."
                                  : "This previews seed slots before teams are approved. The structure can change until the bracket is generated or matches are scheduled."}
                              </p>
                            </div>
                            <Badge variant="outline">{isArabic ? "أفضل فريقين يتأهلان" : "Top 2 qualify"}</Badge>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {createDrawPreview.map((group) => (
                              <div key={group.label} className="rounded-xl border bg-background/70 p-3">
                                <p className="font-semibold text-foreground">{group.label}</p>
                                <div className="mt-2 space-y-1">
                                  {group.teams.map((team) => (
                                    <div key={team} className="rounded-lg bg-muted/60 px-2 py-1 text-xs text-muted-foreground">{team}</div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border p-4">
                            <p className="flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4" />{isArabic ? "قواعد التأهل" : "Qualification rules"}</p>
                            <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
                              {getRankingRulesText(isArabic).map((rule) => <li key={rule}>{rule}</li>)}
                            </ol>
                          </div>
                          <div className="rounded-2xl border p-4">
                            <p className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4" />{isArabic ? "سياسة النتائج" : "Score policy"}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{getScorePolicyText(isArabic)}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {createStep === "dates" ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="create-registration-open">{isArabic ? "فتح التسجيل" : "Registration opens"}</Label>
                            <Input id="create-registration-open" type="datetime-local" required aria-required="true" value={form.registrationOpenAt} onChange={(event) => setForm((current) => ({ ...current, registrationOpenAt: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="create-registration-close">{isArabic ? "إغلاق التسجيل" : "Registration closes"}</Label>
                            <Input id="create-registration-close" type="datetime-local" required aria-required="true" value={form.registrationCloseAt} onChange={(event) => setForm((current) => ({ ...current, registrationCloseAt: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="create-start-date">{isArabic ? "بداية البطولة" : "Tournament starts"}</Label>
                            <Input id="create-start-date" type="datetime-local" required aria-required="true" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="create-end-date">{isArabic ? "نهاية البطولة" : "Tournament ends"}</Label>
                            <Input id="create-end-date" type="datetime-local" required aria-required="true" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create-rules">{isArabic ? "القواعد" : "Rules"}</Label>
                          <Textarea
                            id="create-rules"
                            value={form.rules}
                            onChange={(event) => setForm((current) => ({ ...current, rules: event.target.value }))}
                            placeholder={isArabic ? "مثال: أفضل من ثلاث مجموعات" : "Example: best of three sets"}
                          />
                        </div>
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground">
                          {isArabic
                            ? "نصيحة: اجعل إغلاق التسجيل قبل بداية البطولة بوقت كافٍ لمراجعة الفرق وإنشاء القرعة."
                            : "Tip: close registration early enough to review teams and generate the draw before the event starts."}
                        </div>
                      </div>
                    ) : null}

                    {createStep === "courts" ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label>{isArabic ? "ملاعب البطولة" : "Tournament courts"}</Label>
                          <p className="text-xs text-muted-foreground">
                            {isArabic
                              ? "يجب اختيار ملعب واحد على الأقل. المباريات لا يمكن جدولتها إلا على الملاعب المحددة هنا."
                              : "Choose at least one court. Matches can only be scheduled on courts assigned here."}
                          </p>
                          {effectiveRole === "admin" && selectedCreateManagerId ? (
                            <p className="text-xs text-muted-foreground">
                              {isArabic
                                ? `تم قفل الاختيار على ملاعب ${selectedCreateManagerName || "هذا المدير"} لأن جميع ملاعب البطولة يجب أن تتبع مديرًا واحدًا.`
                                : `Selection is locked to ${selectedCreateManagerName || "this manager"} because tournament courts must belong to one manager.`}
                            </p>
                          ) : null}
                        </div>
                        <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2">
                          {courtsLoading ? (
                            <div className="md:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {isArabic ? "جارٍ تحميل الملاعب..." : "Loading courts..."}
                            </div>
                          ) : sortedCourts.length > 0 ? (
                            sortedCourts.map((court) => {
                              const isSelected = form.courtIds.includes(court.id);
                              const lockedToOtherManager = effectiveRole === "admin" && !!selectedCreateManagerId && court.managerId !== selectedCreateManagerId && !isSelected;
                              return (
                                <label
                                  key={court.id}
                                  className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${lockedToOtherManager ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-muted/40"}`}
                                >
                                  <Checkbox checked={isSelected} disabled={lockedToOtherManager} onCheckedChange={() => toggleCourt(court.id)} />
                                  <div className="space-y-1">
                                    <p className="font-semibold text-foreground">{isArabic ? court.name : court.nameEn || court.name}</p>
                                    <p className="text-xs text-muted-foreground">{isArabic ? court.city : court.cityEn || court.city}</p>
                                    {effectiveRole === "admin" ? (
                                      <p className="text-xs text-muted-foreground">
                                        {isArabic ? "المدير:" : "Manager:"} {court.managerName || (isArabic ? "غير محدد" : "Unknown")}
                                      </p>
                                    ) : null}
                                  </div>
                                </label>
                              );
                            })
                          ) : (
                            <p className="md:col-span-2 text-sm text-muted-foreground">
                              {isArabic ? "لا توجد ملاعب متاحة حاليًا." : "No active courts are available right now."}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {createStep === "review" ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border bg-primary/5 p-5">
                          <div className="flex items-center gap-2 font-semibold text-foreground">
                            <Eye className="h-4 w-4" />
                            {isArabic ? "مراجعة البطولة قبل الإنشاء" : "Review before creating"}
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs text-muted-foreground">{isArabic ? "الاسم" : "Title"}</p>
                              <p className="font-semibold">{form.title || (isArabic ? "بدون اسم" : "Untitled")}</p>
                            </div>
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs text-muted-foreground">{isArabic ? "النظام" : "Format"}</p>
                              <p className="font-semibold">{createFormatPreview.label}</p>
                            </div>
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs text-muted-foreground">{isArabic ? "الملاعب" : "Courts"}</p>
                              <p className="font-semibold">
                                {selectedCreateCourts.length
                                  ? selectedCreateCourts.map((court) => (isArabic ? court.name : court.nameEn || court.name)).join(" • ")
                                  : isArabic ? "لم يتم اختيار ملاعب" : "No courts selected"}
                              </p>
                            </div>
                            <div className="rounded-xl bg-background/70 p-3">
                              <p className="text-xs text-muted-foreground">{isArabic ? "سياسة التأهل" : "Qualification"}</p>
                              <p className="font-semibold">{isArabic ? "أفضل فريقين من كل مجموعة" : "Top two teams per group"}</p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                          {isArabic
                            ? "بعد إنشاء البطولة يمكنك نشرها، فتح التسجيل، مراجعة الفرق، ثم إنشاء القرعة. يتم قفل هيكل البطولة بعد جدولة أو تسجيل أي مباراة."
                            : "After creation you can publish it, open registration, review teams, then generate the draw. The structure locks once any match is scheduled or scored."}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <DialogFooter className="gap-2 sm:justify-between">
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setOpenCreate(false)}>
                        {isArabic ? "إلغاء" : "Cancel"}
                      </Button>
                      <Button variant="outline" onClick={goToPreviousCreateStep} disabled={!canGoBackCreateStep || createLoading}>
                        {isArabic ? "السابق" : "Back"}
                      </Button>
                    </div>
                    {createStep === "review" ? (
                      <Button onClick={submitCreate} disabled={createLoading}>
                        {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {isArabic ? "إنشاء البطولة" : "Create tournament"}
                      </Button>
                    ) : (
                      <Button type="button" onClick={goToNextCreateStep} disabled={!canGoNextCreateStep}>
                        {isArabic ? "التالي" : "Next"}
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
              </div>
            </div>
            {/* The List View */}
            <div className="space-y-4 border-t border-border/40 bg-muted/10 p-3 sm:p-5">
              <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar">
          {[
            { value: "all" as const, label: isArabic ? "كل البطولات" : "All tournaments" },
            { value: "registration_open" as const, label: isArabic ? "التسجيل مفتوح" : "Registration open" },
            { value: "registration_closed" as const, label: isArabic ? "جاهزة للقرعة" : "Closed" },
            { value: "in_progress" as const, label: isArabic ? "جارية" : "In progress" },
            { value: "completed" as const, label: isArabic ? "منتهية" : "Completed" },
          ].map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={statusFilter === option.value ? "default" : "outline"}
            onClick={() => setStatusFilter(option.value)}
          >
            {option.label}
            </Button>
          ))}
        </div>
      {!loading && (totalItems > 0 || deferredQuery || statusFilter !== "all" || mineOnly) ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {isArabic
              ? `${totalItems} بطولة`
              : `${totalItems} tournament${totalItems !== 1 ? "s" : ""}`}
          </span>
          {(deferredQuery || statusFilter !== "all" || mineOnly) ? (
            <span className="text-muted-foreground/60">·</span>
          ) : null}
          {deferredQuery ? (
            <Badge variant="outline" className="gap-1 font-normal">
              {isArabic ? "بحث:" : "Search:"} {deferredQuery}
              <button
                type="button"
                aria-label={isArabic ? "مسح فلتر البحث" : "Clear search filter"}
                title={isArabic ? "مسح فلتر البحث" : "Clear search filter"}
                onClick={() => setQuery("")}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ) : null}
          {statusFilter !== "all" ? (
            <Badge variant="outline" className={`gap-1 font-normal ${statusTone[statusFilter] || ""}`}>
              {statusLabel(statusFilter, isArabic)}
              <button
                type="button"
                aria-label={isArabic ? "مسح فلتر الحالة" : "Clear status filter"}
                title={isArabic ? "مسح فلتر الحالة" : "Clear status filter"}
                onClick={() => setStatusFilter("all")}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ) : null}
          {mineOnly ? (
            <Badge variant="outline" className="gap-1 font-normal">
              {isArabic ? "بطولاتي" : "My tournaments"}
              <button
                type="button"
                aria-label={isArabic ? "مسح فلتر بطولاتي" : "Clear my tournaments filter"}
                title={isArabic ? "مسح فلتر بطولاتي" : "Clear my tournaments filter"}
                onClick={() => setMineOnly(false)}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-80 animate-pulse rounded-2xl border-border/60 bg-muted/35 shadow-sm dark:border-white/[0.14] dark:bg-white/[0.045]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={isArabic ? "لا توجد بطولات مطابقة" : "No tournaments found"}
          description={
            isArabic
              ? "جرّب تغيير البحث أو الفلتر الحالي. ويمكنك إنشاء بطولة جديدة إذا كنت مديرًا أو مسؤولًا."
              : "Try adjusting the search or current filter. Managers and admins can also create a new tournament."
          }
        />
      ) : (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {items.map((tournament) => {
            const activeTeams = tournament.stats?.activeRegistrations
              ?? (tournament.teams || []).filter((team) => ["pending", "approved"].includes(team.status)).length;
            const title = isArabic ? tournament.titleAr || tournament.title : tournament.title;
            const countdownInfo = getTournamentCardCountdown(tournament, isArabic);
            const phaseInfo = getTournamentPhaseInfo(tournament, isArabic);
            const capacityPercent = tournament.maxTeams > 0 ? Math.min(100, (activeTeams / tournament.maxTeams) * 100) : 0;
            const publicPath = `/tournaments/${tournament.id}`;
            const registrationOpenAtMs = toMs(tournament.registrationOpenAt);
            const registrationCloseAtMs = toMs(tournament.registrationCloseAt);
            const tournamentStartAtMs = toMs(tournament.startDate);
            const totalMatches = tournament.stats?.totalMatches ?? (tournament.matches || []).length;
            const waitlistOpen =
              !["draft", "cancelled", "completed"].includes(tournament.status) &&
              !(registrationOpenAtMs != null && registrationOpenAtMs > Date.now()) &&
              !(registrationCloseAtMs != null && registrationCloseAtMs < Date.now()) &&
              !(tournamentStartAtMs != null && tournamentStartAtMs <= Date.now()) &&
              totalMatches === 0 &&
              activeTeams >= tournament.maxTeams;
            const publicVisible = tournament.status !== "draft";
            const courtsLabel =
              (tournament.courts || [])
                .map((court) => (isArabic ? court.name : court.nameEn || court.name))
                .filter(Boolean)
                .join(" • ") || (isArabic ? "لم يتم تحديد ملاعب" : "No courts assigned");

            const accentClass = getTournamentAccentClass(tournament);
            const capacityToneClass = getCapacityToneClass(activeTeams, tournament.maxTeams);
            const primaryCourt = (tournament.courts || [])[0];
            const primaryCourtName = primaryCourt
              ? (isArabic ? primaryCourt.name || primaryCourt.nameEn : primaryCourt.nameEn || primaryCourt.name) || courtsLabel
              : courtsLabel;
            const primaryCourtCity = primaryCourt
              ? (isArabic ? primaryCourt.city || primaryCourt.cityEn : primaryCourt.cityEn || primaryCourt.city)
              : null;
            const extraCourtsCount = Math.max(0, (tournament.courts || []).length - 1);
            const dateWindow = formatTournamentWindow(tournament, isArabic);
            const formatSummary = getTournamentFormatSummary(tournament, isArabic);

            return (
              <Card
                key={tournament.id}
                className="group flex min-h-[360px] flex-col overflow-hidden rounded-2xl border-border/60 bg-background shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md dark:border-white/[0.14] dark:bg-[oklch(0.18_0.014_255)] dark:shadow-[0_18px_46px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045)] dark:hover:border-primary/45"
              >
                <div className={`h-1 w-full ${accentClass}`} />
                <CardHeader className="space-y-3 p-4 pb-2 sm:p-5 sm:pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="line-clamp-2 text-lg font-extrabold leading-snug tracking-normal">{title}</CardTitle>
                      <CardDescription className="line-clamp-1 text-xs font-medium">{tournament.managerName || (isArabic ? "مدير البطولة" : "Tournament manager")}</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${phaseInfo.tone}`}>{phaseInfo.short}</Badge>
                    </div>
                  </div>

                  {(countdownInfo || waitlistOpen) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {countdownInfo ? (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${countdownInfo.tone}`}>
                          {countdownInfo.label}: <span className="ms-1 font-bold">{countdownInfo.value}</span>
                        </span>
                      ) : null}
                      {waitlistOpen ? (
                        <Badge variant="outline" className="text-xs">
                          {isArabic ? "قائمة انتظار متاحة" : "Waitlist open"}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0 sm:p-5 sm:pt-0">
                  <p className="rounded-xl border border-border/50 bg-muted/35 px-3 py-2 text-xs font-medium text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-300">
                    {getRegistrationStateText(tournament, isArabic)}
                  </p>

                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <div className="rounded-xl border border-border/50 bg-background px-3 py-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
                      <div className="mb-2 flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="font-semibold text-foreground">{isArabic ? "الفرق" : "Teams"}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{activeTeams}/{tournament.maxTeams} {isArabic ? "تسجيلات نشطة" : "active registrations"}</span>
                          {activeTeams >= tournament.maxTeams ? (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">{isArabic ? "مكتمل" : "Full"}</span>
                          ) : null}
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted dark:bg-white/[0.1]">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${capacityToneClass}`}
                            style={{ width: `${capacityPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-background px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
                      <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="line-clamp-2">{dateWindow}</span>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-background px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="line-clamp-1 font-medium text-foreground">{primaryCourtName}</span>
                        <span className="line-clamp-1 text-muted-foreground">
                          {[primaryCourtCity, extraCourtsCount > 0 ? (isArabic ? `+${extraCourtsCount} ملاعب` : `+${extraCourtsCount} courts`) : null].filter(Boolean).join(" - ")}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-background px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
                      <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="line-clamp-2">{formatSummary}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.1]">
                    <div className="min-w-0">
                      <p className="text-base font-extrabold text-foreground">
                        {tournament.entryFee != null ? `${tournament.entryFee} EGP` : isArabic ? "بدون رسوم" : "Free"}
                      </p>
                      {tournament.winner?.teamName ? (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <Trophy className="h-3 w-3" />
                          {tournament.winner.teamName}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      {publicVisible ? (
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-full dark:border-white/[0.14] dark:bg-white/[0.035] dark:hover:bg-white/[0.08]" asChild>
                          <Link
                            href={publicPath}
                            target="_blank"
                            aria-label={isArabic ? "فتح الصفحة العامة للبطولة" : "Open public tournament page"}
                            title={isArabic ? "فتح الصفحة العامة للبطولة" : "Open public tournament page"}
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">
                              {isArabic ? "فتح الصفحة العامة للبطولة" : "Open public tournament page"}
                            </span>
                          </Link>
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={deletingTournamentId === tournament.id}
                          onClick={() => handleDeleteTournament(tournament)}
                          aria-label={isArabic ? "حذف البطولة" : "Delete tournament"}
                          title={isArabic ? "حذف البطولة" : "Delete tournament"}
                        >
                          {deletingTournamentId === tournament.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span className="sr-only">{isArabic ? "حذف البطولة" : "Delete tournament"}</span>
                        </Button>
                      ) : null}
                      <Button size="sm" className="h-9 flex-1 gap-2 rounded-full px-4 sm:flex-none" asChild>
                        <Link href={`/dashboard/${role}/tournaments/${tournament.id}`}>
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          {isArabic ? "فتح" : "Open"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            {isArabic
              ? `الصفحة ${page} من ${pages} · ${totalItems} بطولة`
              : `Page ${page} of ${pages} · ${totalItems} tournaments`}
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    if (page > 1) setPage((current) => current - 1);
                  }}
                  aria-disabled={page <= 1}
                  className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>

              {Array.from({ length: pages }, (_, index) => index + 1)
                .filter((pageNumber) => Math.abs(pageNumber - page) <= 1 || pageNumber === 1 || pageNumber === pages)
                .map((pageNumber, index, visiblePages) => (
                  <PaginationItem key={pageNumber}>
                    {index > 0 && visiblePages[index - 1] !== pageNumber - 1 ? (
                      <span className="px-2 text-muted-foreground">…</span>
                    ) : null}
                    <PaginationLink
                      href="#"
                      isActive={pageNumber === page}
                      onClick={(event) => {
                        event.preventDefault();
                        setPage(pageNumber);
                      }}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    if (page < pages) setPage((current) => current + 1);
                  }}
                  aria-disabled={page >= pages}
                  className={page >= pages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
            </div>
          </CardContent>
        </Card>
      </AnimatedContainer>
    </div>

    <AlertDialog open={!!tournamentToDelete} onOpenChange={(open) => { if (!open) setTournamentToDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isArabic ? "هل أنت متأكد من حذف البطولة؟" : "Delete tournament?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArabic
              ? `سيتم حذف بطولة "${tournamentToDelete ? (tournamentToDelete.titleAr || tournamentToDelete.title) : ""}" نهائيًا. سيتم حذف جميع الفرق والمباريات والنتائج المرتبطة بها ولا يمكن التراجع عن هذا الإجراء.`
              : `"${tournamentToDelete?.title ?? ""}" will be permanently deleted along with all its teams, matches, and results. This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{isArabic ? "إلغاء" : "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirmDeleteTournament}
          >
            {isArabic ? "تأكيد الحذف" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
