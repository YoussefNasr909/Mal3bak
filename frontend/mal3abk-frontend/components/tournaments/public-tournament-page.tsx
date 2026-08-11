"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  ListOrdered,
  Loader2,
  MapPin,
  Medal,
  Share2,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CompetitionBoard } from "@/components/tournaments/competition-board";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPublicTournament } from "@/lib/api";
import type { Tournament, TournamentMatch } from "@/lib/types";
import { buildCompetitionFilters, getKnockoutRoundLabel as getSharedKnockoutRoundLabel, groupTournamentMatches } from "@/lib/tournaments/competition";
import { cn } from "@/lib/utils";

const statusTone: Record<Tournament["status"], string> = {
  draft: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
  published: "bg-sky-500/10 text-sky-700 dark:text-sky-200",
  registration_open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  registration_closed: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  in_progress: "bg-violet-500/10 text-violet-700 dark:text-violet-200",
  completed: "bg-green-500/10 text-green-700 dark:text-green-200",
  cancelled: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
};

function statusLabel(status: Tournament["status"], ar: boolean) {
  const map: Record<Tournament["status"], string> = ar
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

function getActiveRegistrationCount(tournament: Tournament) {
  return tournament.stats?.activeRegistrations
    ?? (tournament.teams || []).filter((team) => ["pending", "approved"].includes(team.status)).length;
}

function getApprovedTeamCount(tournament: Tournament) {
  return tournament.stats?.approvedTeams
    ?? (tournament.teams || []).filter((team) => team.status === "approved").length;
}

function getPublicPhaseInfo(tournament: Tournament, ar: boolean) {
  const phase = tournament.competitionPhase;
  const map: Record<string, string> = {
    setup: ar ? "مرحلة الإعداد" : "Setup phase",
    registration: ar ? "التسجيل مفتوح" : "Registration live",
    draw_pending: ar ? "بانتظار القرعة" : "Draw pending",
    group_stage: ar ? "دور المجموعات" : "Group stage",
    knockout_stage: ar ? "الأدوار الإقصائية" : "Knockout stage",
    final: ar ? "النهائي قادم" : "Final pending",
    completed: ar ? "تُوّج البطل" : "Champion crowned",
    cancelled: ar ? "أُلغيت البطولة" : "Tournament cancelled",
  };
  if (phase && map[phase]) return map[phase];

  const matches = tournament.matches || [];
  const hasGroupMatches = matches.some((match) => match.stage === "group");
  const hasKnockoutMatches = matches.some((match) => match.stage === "knockout");

  if (tournament.status === "completed") return map.completed;
  if (tournament.status === "cancelled") return map.cancelled;
  if (hasKnockoutMatches) return map.knockout_stage;
  if (hasGroupMatches) return map.group_stage;
  if (tournament.status === "registration_open") return map.registration;
  if (tournament.status === "registration_closed") return map.draw_pending;
  if (tournament.status === "published") return ar ? "جاهزة للتسجيل" : "Ready for registration";
  return map.setup;
}

function getPublicFormatSummary(tournament: Tournament, ar: boolean) {
  const teamsPerGroup = Number(tournament.teamsPerGroup) || 4;
  const groups = tournament.maxTeams ? Math.floor(tournament.maxTeams / teamsPerGroup) : 0;
  const knockoutTeams = groups * 2;

  return ar
    ? `${groups} مجموعة · ${teamsPerGroup} فرق لكل مجموعة · ${knockoutTeams} في الإقصائيات`
    : `${groups} groups of ${teamsPerGroup} · top 2 qualify · ${knockoutTeams} knockout teams`;
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

function isWaitlistOpen(tournament: Tournament) {
  const now = Date.now();
  const registrationOpenAt = toMs(tournament.registrationOpenAt);
  const registrationCloseAt = toMs(tournament.registrationCloseAt);
  const startDate = toMs(tournament.startDate);
  const activeTeams = getActiveRegistrationCount(tournament);
  const hasBracket = (tournament.matches || []).length > 0;

  if (["draft", "cancelled", "completed"].includes(tournament.status)) return false;
  if (tournament.status !== "registration_open") return false;
  if (registrationCloseAt != null && registrationCloseAt < now) return false;
  if (startDate != null && startDate <= now) return false;
  if (hasBracket) return false;
  return activeTeams >= tournament.maxTeams;
}

function getCountdownInfo(tournament: Tournament, ar: boolean) {
  const now = Date.now();
  const openAt = toMs(tournament.registrationOpenAt);
  const closeAt = toMs(tournament.registrationCloseAt);
  const startAt = toMs(tournament.startDate);
  const waitlistOpen = isWaitlistOpen(tournament);

  if (tournament.status === "published" && openAt != null && openAt > now) {
    return {
      label: ar ? "يفتح التسجيل خلال" : "Registration opens in",
      value: formatCountdownDuration(openAt - now, ar),
      note: formatDate(tournament.registrationOpenAt, ar),
      tone: "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-200",
    };
  }

  if (waitlistOpen) {
    return {
      label: ar ? "قائمة الانتظار متاحة الآن" : "Waitlist is open now",
      value: ar ? "اكتمل العدد" : "Tournament is full",
      note: ar ? "يمكن للاعبين الانضمام إلى قائمة الانتظار حتى يتوفر مكان شاغر." : "Players can still join the waitlist until a spot opens.",
      tone: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-200",
    };
  }

  if (tournament.status === "registration_open" && closeAt != null && closeAt > now) {
    return {
      label: ar ? "يغلق التسجيل خلال" : "Registration closes in",
      value: formatCountdownDuration(closeAt - now, ar),
      note: formatDate(tournament.registrationCloseAt, ar),
      tone: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200",
    };
  }

  if (["published", "registration_closed", "registration_open"].includes(tournament.status) && startAt != null && startAt > now) {
    return {
      label: ar ? "تبدأ البطولة خلال" : "Tournament starts in",
      value: formatCountdownDuration(startAt - now, ar),
      note: formatDate(tournament.startDate, ar),
      tone: "border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-200",
    };
  }

  if (tournament.status === "in_progress") {
    return {
      label: ar ? "البطولة جارية الآن" : "Tournament is live",
      value: ar ? "تابع الجدول والنتائج" : "Follow matches and results",
      note: ar ? "يتم تحديث المباريات والنتائج هنا أولاً بأول." : "Matches and results are updated here as the tournament moves.",
      tone: "border-primary/20 bg-primary/5 text-primary",
    };
  }

  return null;
}

function getPublicStateText(tournament: Tournament, ar: boolean) {
  const now = Date.now();
  const openAt = toMs(tournament.registrationOpenAt);
  const closeAt = toMs(tournament.registrationCloseAt);
  const startAt = toMs(tournament.startDate);
  const activeTeams = getActiveRegistrationCount(tournament);
  const waitlistOpen = isWaitlistOpen(tournament);

  if (tournament.status === "completed") return ar ? "تمت البطولة بنجاح وتم تأكيد الفائز." : "The tournament is complete and the winner is confirmed.";
  if (tournament.status === "cancelled") return ar ? "تم إلغاء هذه البطولة، لكن ما زالت النتائج السابقة متاحة للمتابعة." : "This tournament was cancelled, but past updates remain available.";
  if (startAt != null && startAt <= now && tournament.status === "in_progress") {
    return ar ? "المباريات جارية حالياً. راقب الجدول لمعرفة أقرب مباراة." : "Matches are underway. Check the schedule for the next matchup.";
  }
  if (waitlistOpen) {
    return ar ? "اكتمل العدد المتاح، لكن يمكن للاعبين الانضمام إلى قائمة الانتظار." : "The bracket pool is full, but players can still join the waitlist.";
  }
  if (tournament.status === "registration_open") {
    return ar
      ? `التسجيل متاح الآن، ويوجد ${Math.max(0, tournament.maxTeams - activeTeams)} مكان${Math.max(0, tournament.maxTeams - activeTeams) === 1 ? "" : "ات"} متبقية.`
      : `Registration is open now, with ${Math.max(0, tournament.maxTeams - activeTeams)} spot${Math.max(0, tournament.maxTeams - activeTeams) === 1 ? "" : "s"} still open.`;
  }
  if (openAt != null && openAt > now) {
    return ar ? "التسجيل لم يبدأ بعد. راقب العد التنازلي للموعد القادم." : "Registration has not opened yet. Watch the countdown for the next milestone.";
  }
  if (closeAt != null && closeAt < now) {
    return ar ? "انتهت نافذة التسجيل، والبطولة تجهز للمرحلة التالية." : "The registration window has ended and the tournament is preparing for the next stage.";
  }
  if (tournament.status === "registration_closed") {
    return ar ? "التسجيل مغلق الآن بانتظار الشجرة أو بدء المباريات." : "Registration is closed while the bracket and matches are being finalized.";
  }
  return ar ? "تابع حالة البطولة لمعرفة الخطوة التالية." : "Follow the tournament status to see what comes next.";
}

function formatSetScorePairs(
  teamA: Array<number | string> | null | undefined,
  teamB: Array<number | string> | null | undefined,
) {
  const aValues = Array.isArray(teamA) ? teamA : [];
  const bValues = Array.isArray(teamB) ? teamB : [];
  const setCount = Math.max(aValues.length, bValues.length);
  if (setCount === 0) return "";

  return Array.from({ length: setCount }, (_, index) => `${aValues[index] ?? "—"}-${bValues[index] ?? "—"}`).join(" / ");
}

function getResultSummary(match: TournamentMatch, ar: boolean) {
  const resultType = match.scoreJson?.resultType || "standard";
  if (resultType === "walkover") return ar ? "فوز بالانسحاب" : "Walkover";
  if (resultType === "retired") return ar ? "فوز بسبب الانسحاب" : "Retired";

  const summary = formatSetScorePairs(match.scoreJson?.teamA, match.scoreJson?.teamB);
  if (!summary) return ar ? "تم تسجيل النتيجة" : "Result recorded";
  return summary;
}

function getNextUpcomingMatch(matches: TournamentMatch[]) {
  const now = Date.now();
  return matches
    .filter((match) => match.status === "scheduled" && toMs(match.startAt) != null && (toMs(match.startAt) || 0) >= now)
    .sort((a, b) => (toMs(a.startAt) || 0) - (toMs(b.startAt) || 0))[0] || null;
}

function buildTournamentShareText(
  tournament: Tournament,
  ar: boolean,
  url: string,
  nextUpcomingMatch: TournamentMatch | null,
) {
  const title = ar ? tournament.titleAr || tournament.title : tournament.title;
  const parts = [
    title,
    ar
      ? `${tournament.stats?.approvedTeams || 0}/${tournament.maxTeams} فرق معتمدة`
      : `${tournament.stats?.approvedTeams || 0}/${tournament.maxTeams} approved teams`,
  ];

  if (nextUpcomingMatch?.startAt) {
    parts.push(
      ar
        ? `المباراة القادمة: ${nextUpcomingMatch.teamAName || "TBD"} ضد ${nextUpcomingMatch.teamBName || "TBD"} - ${formatDate(nextUpcomingMatch.startAt, ar)}`
        : `Next match: ${nextUpcomingMatch.teamAName || "TBD"} vs ${nextUpcomingMatch.teamBName || "TBD"} - ${formatDate(nextUpcomingMatch.startAt, ar)}`,
    );
  } else if (tournament.winner?.teamName) {
    parts.push(ar ? `البطل: ${tournament.winner.teamName}` : `Champion: ${tournament.winner.teamName}`);
  } else if (isWaitlistOpen(tournament)) {
    parts.push(ar ? "قائمة الانتظار مفتوحة الآن" : "Waitlist is open now");
  }

  parts.push(url);
  return parts.join("\n");
}

export function PublicTournamentPage({ tournamentId }: { tournamentId: string }) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isArabic = language === "ar";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const loadTournament = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await getPublicTournament(tournamentId);
      setTournament(result.tournament);
    } catch (error: any) {
      setTournament(null);
      setErrorMessage(error?.message || (isArabic ? "تعذر تحميل صفحة البطولة العامة" : "Failed to load the public tournament page"));
    } finally {
      setLoading(false);
    }
  }, [isArabic, tournamentId]);

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  const competitionGroups = useMemo(() => groupTournamentMatches(tournament?.matches || []), [tournament?.matches]);
  const competitionFilters = useMemo(
    () => buildCompetitionFilters(tournament?.matches || [], isArabic),
    [isArabic, tournament?.matches],
  );
  const knockoutRoundMatchCounts = useMemo(
    () =>
      Object.fromEntries(
        competitionGroups.knockoutRounds.map(([roundNumber, matches]) => [roundNumber, matches.length] as const),
      ) as Record<number, number>,
    [competitionGroups.knockoutRounds],
  );
  const countdownInfo = useMemo(() => (tournament ? getCountdownInfo(tournament, isArabic) : null), [isArabic, tournament]);
  const waitlistOpen = useMemo(() => (tournament ? isWaitlistOpen(tournament) : false), [tournament]);
  const nextUpcomingMatch = useMemo(() => getNextUpcomingMatch(tournament?.matches || []), [tournament?.matches]);

  const activeTeams = tournament ? getActiveRegistrationCount(tournament) : 0;
  const approvedTeams = tournament ? getApprovedTeamCount(tournament) : 0;
  const phaseInfo = tournament ? getPublicPhaseInfo(tournament, isArabic) : "";
  const formatSummary = tournament ? getPublicFormatSummary(tournament, isArabic) : "";
  const remainingSpots = tournament ? Math.max(0, tournament.maxTeams - activeTeams) : 0;
  const dashboardPath = user ? `/dashboard/${user.role}/tournaments/${tournamentId}` : null;

  const copyLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(isArabic ? "تم نسخ رابط البطولة" : "Tournament link copied");
    } catch {
      toast.error(isArabic ? "تعذر نسخ الرابط" : "Unable to copy the link");
    }
  }, [isArabic]);

  const shareTournament = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = tournament ? (isArabic ? tournament.titleAr || tournament.title : tournament.title) : "Tournament";
    const shareText = tournament ? buildTournamentShareText(tournament, isArabic, url, nextUpcomingMatch) : title;
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: shareText,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(isArabic ? "تم نسخ الرابط للمشاركة" : "Share link copied");
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        toast.error(isArabic ? "تعذر مشاركة البطولة الآن" : "Unable to share the tournament right now");
      }
    } finally {
      setSharing(false);
    }
  }, [isArabic, nextUpcomingMatch, tournament]);

  const renderPublicMatchCard = (match: TournamentMatch) => {
    const matchTitle =
      match.stage === "group"
        ? isArabic
          ? `${match.groupId ? `المجموعة ${match.groupId} · ` : ""}جولة ${match.roundNumber} · مباراة ${match.matchNumber}`
          : `${match.groupId ? `Group ${match.groupId} · ` : ""}Round ${match.roundNumber} · Match ${match.matchNumber}`
        : isArabic
          ? `${getSharedKnockoutRoundLabel(match.roundNumber, competitionGroups.totalKnockoutRounds, true)} · مباراة ${match.matchNumber}`
          : `${getSharedKnockoutRoundLabel(match.roundNumber, competitionGroups.totalKnockoutRounds, false)} · Match ${match.matchNumber}`;

    const scoreA = Array.isArray(match.scoreJson?.teamA) && match.scoreJson?.teamA.length ? match.scoreJson.teamA : null;
    const scoreB = Array.isArray(match.scoreJson?.teamB) && match.scoreJson?.teamB.length ? match.scoreJson.teamB : null;
    const teams = [
      { name: match.teamAName || (isArabic ? "سيحدد لاحقاً" : "TBD"), winner: !!(match.winnerTeamId && match.winnerTeamId === match.teamAId), scores: scoreA },
      { name: match.teamBName || (isArabic ? "سيحدد لاحقاً" : "TBD"), winner: !!(match.winnerTeamId && match.winnerTeamId === match.teamBId), scores: scoreB },
    ];

    return (
      <div key={match.id} className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-muted/20 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{matchTitle}</p>
            {(match.courtName || match.courtNameEn) ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {isArabic ? match.courtName || match.courtNameEn : match.courtNameEn || match.courtName}
              </p>
            ) : null}
          </div>
          <Badge className={cn(
            "shrink-0 text-xs",
            match.status === "completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
            match.status === "scheduled" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" :
            "bg-slate-500/10 text-slate-600 dark:text-slate-300",
          )}>
            {match.status === "completed" ? (isArabic ? "مكتملة" : "Completed") :
             match.status === "scheduled" ? (isArabic ? "مجدولة" : "Scheduled") :
             isArabic ? "بانتظار التحديد" : "Pending"}
          </Badge>
        </div>

        {/* Teams */}
        <div className="divide-y divide-border/40">
          {teams.map((team, index) => (
            <div
              key={`${match.id}-${index}`}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                team.winner ? "bg-primary/5" : "",
              )}
            >
              {team.winner ? (
                <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <div className="h-4 w-4 shrink-0" />
              )}
              <p className={cn(
                "min-w-0 flex-1 truncate text-sm",
                team.winner ? "font-bold text-foreground" : "font-medium text-muted-foreground",
              )}>
                {team.name}
              </p>
              {team.scores ? (
                <div className="flex shrink-0 items-center gap-1">
                  {team.scores.map((s: number, i: number) => (
                    <span
                      key={i}
                      className={cn(
                        "flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 text-sm font-bold tabular-nums",
                        team.winner ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Footer */}
        {(match.startAt || match.winnerTeamName || (scoreA && scoreB)) ? (
          <div className="border-t border-border/40 bg-muted/10 px-4 py-2 space-y-1">
            {match.winnerTeamName ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Trophy className="h-3 w-3" />
                {isArabic ? `الفائز: ${match.winnerTeamName}` : `Winner: ${match.winnerTeamName}`}
              </p>
            ) : null}
            {scoreA && scoreB ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {scoreA.join("-")} / {scoreB.join("-")}
              </p>
            ) : null}
            {match.startAt ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                {formatDate(match.startAt, isArabic)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const copyShareText = useCallback(async () => {
    if (typeof window === "undefined" || !tournament) return;
    try {
      await navigator.clipboard.writeText(buildTournamentShareText(tournament, isArabic, window.location.href, nextUpcomingMatch));
      toast.success(isArabic ? "تم نسخ نص المشاركة" : "Share text copied");
    } catch {
      toast.error(isArabic ? "تعذر نسخ نص المشاركة" : "Unable to copy the share text");
    }
  }, [isArabic, nextUpcomingMatch, tournament]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-72 animate-pulse rounded-[32px] bg-muted/40" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
          <div className="space-y-4">
            <div className="h-36 animate-pulse rounded-2xl bg-muted/40" />
            <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
          </div>
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState
          title={isArabic ? "تعذر عرض البطولة" : "Unable to show this tournament"}
          description={errorMessage || (isArabic ? "قد تكون البطولة غير متاحة للعامة أو تم حذفها." : "The tournament may no longer be public or may have been removed.")}
          action={{
            label: isArabic ? "إعادة المحاولة" : "Try again",
            onClick: loadTournament,
          }}
        />
      </div>
    );
  }

  const title = isArabic ? tournament.titleAr || tournament.title : tournament.title;
  const description = isArabic ? tournament.descriptionAr || tournament.description : tournament.description;
  const stateText = getPublicStateText(tournament, isArabic);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" dir={isArabic ? "rtl" : "ltr"}>
      <section className="relative overflow-hidden rounded-[32px] border border-border/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(245,158,11,0.08),rgba(59,130,246,0.06))] p-6 sm:p-8">
        <div className="absolute inset-y-0 end-0 hidden w-56 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_65%)] md:block" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusTone[tournament.status]}>{statusLabel(tournament.status, isArabic)}</Badge>
                <Badge variant="outline">{phaseInfo}</Badge>
                {waitlistOpen ? (
                  <Badge variant="outline">
                    <ListOrdered className="h-3.5 w-3.5" />
                    {isArabic ? "قائمة الانتظار متاحة" : "Waitlist open"}
                  </Badge>
                ) : null}
                {tournament.winner?.teamName ? (
                  <Badge variant="outline">
                    <Trophy className="h-3.5 w-3.5" />
                    {isArabic ? "البطل" : "Champion"}: {tournament.winner.teamName}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  {description || (isArabic ? "صفحة عامة لمتابعة تفاصيل البطولة، الجدول، والنتائج من مكان واحد." : "A public page to follow the tournament details, schedule, and results in one place.")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {activeTeams}/{tournament.maxTeams} {isArabic ? "تسجيلات نشطة" : "active registrations"}
                </span>
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  {formatSummary}
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(tournament.startDate, isArabic)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {(tournament.courts || []).length > 0
                    ? (tournament.courts || []).map((court) => (isArabic ? court.name : court.nameEn || court.name)).filter(Boolean).join(" • ")
                    : isArabic
                      ? "لم يتم تحديد الملاعب بعد"
                      : "Courts will be announced"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={copyLink}>
                <Copy className="h-4 w-4" />
                {isArabic ? "نسخ الرابط" : "Copy link"}
              </Button>
              <Button variant="outline" onClick={copyShareText}>
                <Copy className="h-4 w-4" />
                {isArabic ? "نسخ نص المشاركة" : "Copy share text"}
              </Button>
              <Button variant="outline" onClick={shareTournament} disabled={sharing}>
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                {isArabic ? "مشاركة" : "Share"}
              </Button>
              {dashboardPath ? (
                <Button asChild>
                  <Link href={dashboardPath}>
                    <ExternalLink className="h-4 w-4" />
                    {isArabic ? "فتح من لوحة التحكم" : "Open in dashboard"}
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/auth/login">
                    <ExternalLink className="h-4 w-4" />
                    {isArabic ? "سجّل الدخول" : "Sign in"}
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-white/40 bg-background/80 backdrop-blur">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{isArabic ? "التسجيلات النشطة" : "Active registrations"}</p>
                  <p className="mt-0.5 text-2xl font-bold text-foreground">{activeTeams}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isArabic ? `${approvedTeams} معتمدة` : `${approvedTeams} approved`}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/40 bg-background/80 backdrop-blur">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", remainingSpots === 0 ? "bg-rose-500/10" : "bg-emerald-500/10")}>
                  <Shield className={cn("h-5 w-5", remainingSpots === 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{isArabic ? "المقاعد المتبقية" : "Spots left"}</p>
                  <p className="mt-0.5 text-2xl font-bold text-foreground">{remainingSpots}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isArabic ? `من ${tournament.maxTeams}` : `of ${tournament.maxTeams} total`}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/40 bg-background/80 backdrop-blur">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <ListOrdered className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{isArabic ? "قائمة الانتظار" : "Waitlist"}</p>
                  <p className="mt-0.5 text-2xl font-bold text-foreground">{tournament.stats?.waitlistCount || 0}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isArabic ? (waitlistOpen ? "نشطة الآن" : "غير نشطة") : (waitlistOpen ? "Active now" : "Not active")}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/40 bg-background/80 backdrop-blur">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                  <CheckCircle2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{isArabic ? "المباريات المكتملة" : "Completed matches"}</p>
                  <p className="mt-0.5 text-2xl font-bold text-foreground">
                    {tournament.stats?.completedMatches || 0}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isArabic ? `من ${tournament.stats?.totalMatches || 0}` : `of ${tournament.stats?.totalMatches || 0} total`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_360px]">
        <Card className="border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle>{isArabic ? "نظرة عامة" : "Overview"}</CardTitle>
            <CardDescription>
              {isArabic ? "كل ما يحتاجه اللاعب لفهم حالة البطولة الحالية دون الدخول إلى لوحة التحكم." : "Everything a player needs to understand the current tournament state without opening the dashboard."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Alert className="border-primary/20 bg-primary/5">
              <Info className="h-4 w-4" />
              <AlertTitle>{isArabic ? "الحالة العامة" : "Current state"}</AlertTitle>
              <AlertDescription>{stateText}</AlertDescription>
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isArabic ? "التسجيل" : "Registration"}</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {waitlistOpen
                    ? isArabic
                      ? "العدد مكتمل وقائمة الانتظار نشطة"
                      : "Full capacity, waitlist available"
                    : tournament.status === "registration_open"
                      ? isArabic
                        ? "باب التسجيل مفتوح الآن"
                        : "Registration is open now"
                      : isArabic
                        ? "تابع الشريط الزمني لمعرفة المرحلة الحالية"
                        : "Follow the tournament timeline for the current stage"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isArabic
                    ? `المراجعات المعلقة: ${tournament.stats?.pendingTeams || 0} • الفرق المعتمدة: ${tournament.stats?.approvedTeams || 0}`
                    : `Pending reviews: ${tournament.stats?.pendingTeams || 0} • Approved teams: ${tournament.stats?.approvedTeams || 0}`}
                </p>
              </div>

              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isArabic ? "الصيغة" : "Format"}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Swords className="h-4 w-4" />
                  {isArabic
                    ? `${tournament.format === "single_elimination" ? "خروج المغلوب" : tournament.format} • ${tournament.teamSize === 1 ? "فردي" : tournament.teamSize === 2 ? "زوجي" : tournament.teamSize === 3 ? "ثلاثي" : tournament.teamSize === 4 ? "رباعي" : `${tournament.teamSize}v${tournament.teamSize}`}`
                    : `${tournament.format === "single_elimination" ? "Single elimination" : tournament.format} • ${tournament.teamSize === 1 ? "Singles" : tournament.teamSize === 2 ? "Doubles" : tournament.teamSize === 3 ? "Triples" : tournament.teamSize === 4 ? "Quads" : `${tournament.teamSize}v${tournament.teamSize}`}`}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tournament.entryFee != null
                    ? isArabic
                      ? `رسوم الاشتراك: ${tournament.entryFee} ج.م`
                      : `Entry fee: ${tournament.entryFee} EGP`
                    : isArabic
                      ? "لا توجد رسوم اشتراك معلنة"
                      : "No entry fee has been announced"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <p className="text-sm font-semibold text-foreground">{isArabic ? "القواعد" : "Rules"}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {tournament.rules || (isArabic ? "سيتم نشر القواعد التفصيلية قريباً." : "Detailed rules will be published here soon.")}
                </p>
              </div>

              <div className="rounded-2xl border p-4">
                <p className="text-sm font-semibold text-foreground">{isArabic ? "الملاعب المعتمدة" : "Assigned courts"}</p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {(tournament.courts || []).length > 0 ? (
                    (tournament.courts || []).map((court) => (
                      <div key={court.id} className="rounded-xl bg-muted/30 px-3 py-2">
                        <p className="font-medium text-foreground">{isArabic ? court.name : court.nameEn || court.name}</p>
                        <p>{isArabic ? court.city : court.cityEn || court.city}</p>
                      </div>
                    ))
                  ) : (
                    <p>{isArabic ? "سيتم إعلان الملاعب لاحقاً." : "Courts will be announced later."}</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className={cn("border-border/60", countdownInfo?.tone || "bg-background/90")}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isArabic ? "العد التنازلي" : "Countdown"}
              </p>
              {countdownInfo ? (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-medium">{countdownInfo.label}</p>
                  <p className="text-4xl font-bold tracking-tight">{countdownInfo.value}</p>
                  <p className="pt-1 text-xs opacity-75">{countdownInfo.note}</p>
                </div>
              ) : (
                <div className="mt-3 space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {tournament.status === "completed"
                      ? isArabic ? "انتهت الرحلة وتم حسم البطل" : "Journey complete"
                      : tournament.status === "cancelled"
                        ? isArabic ? "توقفت البطولة بعد الإلغاء" : "Tournament cancelled"
                        : isArabic ? "لا يوجد موعد زمني قادم الآن" : "No upcoming milestone"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isArabic ? "تابع الجدول أدناه للمستجدات." : "Check the schedule below for updates."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {nextUpcomingMatch ? (
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  {isArabic ? "المباراة القادمة" : "Next match"}
                </p>
                <p className="mt-2 text-sm font-bold text-foreground">
                  {nextUpcomingMatch.teamAName || (isArabic ? "سيحدد لاحقاً" : "TBD")}
                  <span className="mx-2 font-normal text-muted-foreground">vs</span>
                  {nextUpcomingMatch.teamBName || (isArabic ? "سيحدد لاحقاً" : "TBD")}
                </p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatDate(nextUpcomingMatch.startAt, isArabic)}
                  </p>
                  {nextUpcomingMatch.courtName || nextUpcomingMatch.courtNameEn ? (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {isArabic ? nextUpcomingMatch.courtName || nextUpcomingMatch.courtNameEn : nextUpcomingMatch.courtNameEn || nextUpcomingMatch.courtName}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tournament.winner?.teamName ? (
            <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-yellow-500/5">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15">
                  <Trophy className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    {isArabic ? "البطل المؤكد" : "Champion"}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-foreground">{tournament.winner.teamName}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/60 bg-background/90">
            <CardHeader>
              <CardTitle>{isArabic ? "كيف أشارك؟" : "How do I join?"}</CardTitle>
              <CardDescription>
                {isArabic ? "انضم من خلال حساب اللاعب حتى تظهر طلباتك وإشعاراتك بشكل صحيح." : "Join through a player account so your registration and notifications stay connected."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboardPath ? (
                <Button className="w-full" asChild>
                  <Link href={dashboardPath}>
                    <ExternalLink className="h-4 w-4" />
                    {waitlistOpen
                      ? isArabic
                        ? "افتح البطولة للانضمام إلى قائمة الانتظار"
                        : "Open tournament to join the waitlist"
                      : isArabic
                        ? "افتح البطولة من لوحة التحكم"
                        : "Open tournament in dashboard"}
                  </Link>
                </Button>
              ) : (
                <>
                  <Button className="w-full" asChild>
                    <Link href="/auth/login">
                      <ExternalLink className="h-4 w-4" />
                      {waitlistOpen
                        ? isArabic
                          ? "سجّل الدخول للانضمام إلى قائمة الانتظار"
                          : "Sign in to join the waitlist"
                        : isArabic
                          ? "سجّل الدخول للمشاركة"
                          : "Sign in to participate"}
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/auth/register">
                      {isArabic ? "إنشاء حساب لاعب" : "Create a player account"}
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {(tournament.teams || []).length > 0 ? (
        <Card className="border-border/60 bg-background/90">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {isArabic ? "الفرق" : "Teams"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isArabic
                  ? `${(tournament.teams || []).filter((t) => t.status === "approved").length} فريق معتمد من أصل ${(tournament.teams || []).length} مسجل`
                  : `${(tournament.teams || []).filter((t) => t.status === "approved").length} approved out of ${(tournament.teams || []).length} registered`}
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 text-sm">
              {(tournament.teams || []).length}/{tournament.maxTeams}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[...(tournament.teams || [])]
                .sort((a, b) => {
                  if (a.status === "approved" && b.status !== "approved") return -1;
                  if (b.status === "approved" && a.status !== "approved") return 1;
                  if (a.seed != null && b.seed != null) return a.seed - b.seed;
                  if (a.seed != null) return -1;
                  if (b.seed != null) return 1;
                  return (a.teamName || "").localeCompare(b.teamName || "");
                })
                .map((team, idx) => {
                  const isApproved = team.status === "approved";
                  const groupColors: Record<string, string> = {
                    A: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
                    B: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                    C: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    D: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    E: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                  };
                  const groupKey = String((team as any).groupId || "").toUpperCase();
                  const groupColor = groupColors[groupKey] || "bg-muted/50 text-muted-foreground";
                  return (
                    <div
                      key={team.id}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border p-3 transition-colors",
                        isApproved ? "border-border/60 bg-background" : "border-dashed border-border/40 bg-muted/20",
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                        isApproved ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {team.seed ?? idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-semibold", isApproved ? "text-foreground" : "text-muted-foreground")}>
                          {team.teamName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {(team as any).groupId ? (
                            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", groupColor)}>
                              {isArabic ? `المجموعة ${(team as any).groupId}` : `Group ${(team as any).groupId}`}
                            </span>
                          ) : null}
                          {team.seed != null ? (
                            <span className="text-xs text-muted-foreground">
                              {isArabic ? `تصنيف #${team.seed}` : `Seed #${team.seed}`}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-lg px-2 py-1 text-xs font-semibold",
                        isApproved
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                      )}>
                        {isApproved
                          ? isArabic ? "معتمد" : "Approved"
                          : isArabic ? "بانتظار المراجعة" : "Pending"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {competitionGroups.all.length > 0 ? (
        <Card className="border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle>{isArabic ? "لوحة المنافسة" : "Competition board"}</CardTitle>
            <CardDescription>
              {isArabic
                ? "انتقل بين الشجرة الحية والمباريات لرؤية مسار البطولة بطريقة أوضح."
                : "Switch between the live bracket and match views to follow the full tournament path more clearly."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs
              defaultValue={competitionGroups.knockoutRounds.length > 0 ? "bracket" : "matches"}
              dir={isArabic ? "rtl" : "ltr"}
              className="space-y-5"
            >
              <TabsList
                className={cn(
                  "flex h-auto w-full flex-wrap gap-2 bg-transparent p-0",
                  isArabic ? "justify-end" : "justify-start",
                )}
              >
                <TabsTrigger 
                  value="bracket" 
                  className="group flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-muted/80 data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-primary/30"
                >
                  <Trophy className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                  {isArabic ? "شجرة البطولة" : "Bracket"}
                </TabsTrigger>
                <TabsTrigger 
                  value="matches" 
                  className="group flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-muted/80 data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-primary/30"
                >
                  <Swords className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                  {isArabic ? "المباريات" : "Matches"}
                </TabsTrigger>
                {(tournament.teams || []).length > 0 ? (
                  <TabsTrigger 
                    value="teams" 
                    className="group flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-muted/80 data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-primary/20 dark:data-[state=active]:ring-1 dark:data-[state=active]:ring-primary/30"
                  >
                    <Users className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {isArabic ? "الفرق" : "Teams"}
                    <span className="ms-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold">
                      {(tournament.teams || []).filter((t) => t.status === "approved").length}
                    </span>
                  </TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="bracket" className="space-y-4">
                <CompetitionBoard tournament={tournament} isArabic={isArabic} />
              </TabsContent>

              <TabsContent value="matches" className="space-y-4">
                <Tabs
                  key={competitionFilters.map((filter) => filter.value).join("|")}
                  defaultValue={competitionFilters[0]?.value ?? "all"}
                  dir={isArabic ? "rtl" : "ltr"}
                  className="space-y-4"
                >
                  <TabsList
                    className={cn(
                      "flex h-auto w-full flex-wrap gap-2 bg-transparent p-0",
                      isArabic ? "justify-end" : "justify-start",
                    )}
                  >
                    {competitionFilters.map((filter) => (
                      <TabsTrigger
                        key={filter.value}
                        value={filter.value}
                        className="rounded-full border border-border/60 bg-background px-4 py-2 text-xs font-semibold text-muted-foreground data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                      >
                        {filter.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {competitionFilters.map((filter) => {
                    if (filter.kind === "all") {
                      return (
                        <TabsContent key={filter.value} value={filter.value} className="space-y-6">
                          {competitionGroups.groups.map(([groupId, matches]) => (
                            <section key={`group-${groupId}`} className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {isArabic ? `المجموعة ${groupId}` : `Group ${groupId}`}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {isArabic ? `${matches.length} مباراة` : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
                                  </p>
                                </div>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2">{matches.map((match) => renderPublicMatchCard(match))}</div>
                            </section>
                          ))}

                          {competitionGroups.knockoutRounds.map(([roundNumber, matches]) => (
                            <section key={`round-${roundNumber}`} className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {getSharedKnockoutRoundLabel(roundNumber, competitionGroups.totalKnockoutRounds, isArabic)}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {isArabic ? `${matches.length} مباراة` : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
                                  </p>
                                </div>
                              </div>
                              <div className="grid gap-3 lg:grid-cols-2">{matches.map((match) => renderPublicMatchCard(match))}</div>
                            </section>
                          ))}
                        </TabsContent>
                      );
                    }

                    return (
                      <TabsContent key={filter.value} value={filter.value} className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{filter.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {isArabic
                              ? `${filter.matches.length} مباراة`
                              : `${filter.matches.length} match${filter.matches.length === 1 ? "" : "es"}`}
                          </p>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">{filter.matches.map((match) => renderPublicMatchCard(match))}</div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </TabsContent>

              {(tournament.teams || []).length > 0 ? (
                <TabsContent value="teams" className="space-y-4">
                  {(() => {
                    const allTeams = [...(tournament.teams || [])].sort((a, b) => {
                      if (a.status === "approved" && b.status !== "approved") return -1;
                      if (b.status === "approved" && a.status !== "approved") return 1;
                      if (a.seed != null && b.seed != null) return a.seed - b.seed;
                      if (a.seed != null) return -1;
                      if (b.seed != null) return 1;
                      return (a.teamName || "").localeCompare(b.teamName || "");
                    });

                    const groupMap = new Map<string, typeof allTeams>();
                    const ungrouped: typeof allTeams = [];
                    for (const team of allTeams) {
                      const gid = String((team as any).groupId || "");
                      if (gid) {
                        const list = groupMap.get(gid) || [];
                        list.push(team);
                        groupMap.set(gid, list);
                      } else {
                        ungrouped.push(team);
                      }
                    }

                    const hasGroups = groupMap.size > 0;
                    const groupColors: Record<string, string> = {
                      A: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200/50 dark:border-blue-800/50",
                      B: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200/50 dark:border-violet-800/50",
                      C: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/50 dark:border-amber-800/50",
                      D: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-800/50",
                      E: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200/50 dark:border-rose-800/50",
                    };
                    const groupIconColors: Record<string, string> = {
                      A: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                      B: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
                      C: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                      D: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                      E: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                    };

                    const renderTeamRow = (team: (typeof allTeams)[number], rank: number, groupId?: string) => {
                      const isApproved = team.status === "approved";
                      const gKey = (groupId || "").toUpperCase();
                      return (
                        <div
                          key={team.id}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-muted/30",
                            isApproved ? "border-border/60 bg-background" : "border-dashed border-border/40 bg-muted/10",
                          )}
                        >
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                            gKey && groupIconColors[gKey] ? groupIconColors[gKey] : isApproved ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                          )}>
                            {team.seed ?? rank}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn("truncate text-sm font-semibold", isApproved ? "text-foreground" : "text-muted-foreground")}>
                              {team.teamName}
                            </p>
                            {team.seed != null ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {isArabic ? `تصنيف #${team.seed}` : `Seed #${team.seed}`}
                              </p>
                            ) : null}
                          </div>
                          <Medal className={cn("h-4 w-4 shrink-0", isApproved ? "text-amber-500" : "text-muted-foreground/30")} />
                        </div>
                      );
                    };

                    if (hasGroups) {
                      return (
                        <div className="space-y-6">
                          {Array.from(groupMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([groupId, teams]) => {
                            const gKey = groupId.toUpperCase();
                            const headerColor = groupColors[gKey] || "bg-muted/40 text-muted-foreground border-border/40";
                            return (
                              <div key={groupId} className="space-y-2">
                                <div className={cn("inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold", headerColor)}>
                                  {isArabic ? `المجموعة ${groupId}` : `Group ${groupId}`}
                                  <span className="text-xs opacity-70">· {teams.length} {isArabic ? "فرق" : "teams"}</span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {teams.map((team, idx) => renderTeamRow(team, idx + 1, groupId))}
                                </div>
                              </div>
                            );
                          })}
                          {ungrouped.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-muted-foreground">
                                {isArabic ? "فرق أخرى" : "Other teams"}
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {ungrouped.map((team, idx) => renderTeamRow(team, idx + 1))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {allTeams.map((team, idx) => renderTeamRow(team, idx + 1))}
                      </div>
                    );
                  })()}
                </TabsContent>
              ) : null}
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {(tournament.activities || []).length > 0 ? (
        <Card className="border-border/60 bg-background/90">
          <CardHeader>
            <CardTitle>{isArabic ? "آخر التحديثات" : "Latest updates"}</CardTitle>
            <CardDescription>
              {isArabic ? "أهم الأحداث العامة التي طرأت على البطولة." : "The main public-facing events that changed in this tournament."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(tournament.activities || []).map((activity) => (
              <div key={activity.id} className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{activity.title}</p>
                    {activity.description ? <p className="text-sm text-muted-foreground">{activity.description}</p> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(activity.createdAt || null, isArabic)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
