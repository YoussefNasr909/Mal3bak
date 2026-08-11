"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock3, Swords, Trophy, Users } from "lucide-react";

import { KnockoutBracket } from "@/components/tournaments/knockout-bracket";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deriveCompetitionState,
  getKnockoutRoundLabel,
  type CompetitionPreviewSlot,
  type CompetitionStandingRow,
} from "@/lib/tournaments/competition";
import type { Tournament, TournamentMatch } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatCompetitionDate(value: string | Date | null | undefined, isArabic: boolean) {
  if (!value) return isArabic ? "غير محدد" : "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return isArabic ? "غير محدد" : "Not set";

  return new Intl.DateTimeFormat(isArabic ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(date);
}

function getMatchStatusLabel(status: TournamentMatch["status"], isArabic: boolean) {
  if (status === "completed") return isArabic ? "مكتملة" : "Completed";
  if (status === "scheduled") return isArabic ? "مجدولة" : "Scheduled";
  if (status === "cancelled") return isArabic ? "ملغاة" : "Cancelled";
  return isArabic ? "بانتظار التحديد" : "Pending";
}

function getMatchStatusTone(status: TournamentMatch["status"]) {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  if (status === "scheduled") return "bg-sky-500/10 text-sky-700 dark:text-sky-200";
  if (status === "cancelled") return "bg-rose-500/10 text-rose-700 dark:text-rose-200";
  return "bg-slate-500/10 text-slate-700 dark:text-slate-200";
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

function getResultSummary(match: TournamentMatch, isArabic: boolean) {
  const resultType = match.scoreJson?.resultType || "standard";
  if (resultType === "walkover") return isArabic ? "فوز بالانسحاب" : "Walkover";
  if (resultType === "retired") return isArabic ? "فوز بسبب الانسحاب" : "Retired";

  const summary = formatSetScorePairs(match.scoreJson?.teamA, match.scoreJson?.teamB);
  if (!summary) return isArabic ? "تم تسجيل النتيجة" : "Result recorded";
  return summary;
}

function getStandingTone(row: CompetitionStandingRow) {
  if (row.qualificationStatus === "qualified") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  if (row.qualificationStatus === "eliminated") return "bg-rose-500/10 text-rose-700 dark:text-rose-200";
  if (row.qualificationStatus === "leading") return "bg-sky-500/10 text-sky-700 dark:text-sky-200";
  return "bg-slate-500/10 text-slate-700 dark:text-slate-200";
}

function getStandingLabel(row: CompetitionStandingRow, isArabic: boolean) {
  if (row.qualificationStatus === "qualified") return isArabic ? "متأهل" : "Qualified";
  if (row.qualificationStatus === "eliminated") return isArabic ? "خارج التأهل" : "Eliminated";
  if (row.qualificationStatus === "leading") return isArabic ? "داخل المراكز المؤهلة" : "Currently top 2";
  return isArabic ? "في المنافسة" : "In Race";
}

function getPreviewSlotTitle(slot: CompetitionPreviewSlot, isArabic: boolean) {
  if (slot.slotType === "bye") return isArabic ? "تأهل تلقائي" : "Bye";
  if (slot.slotType === "winner") return isArabic ? `فائز ${slot.referenceLabel}` : `Winner ${slot.referenceLabel}`;
  if (slot.sourceStatus === "confirmed" && slot.teamName) return slot.teamName;
  if (slot.slotType === "qualifier") return slot.referenceLabel;
  return isArabic ? "بانتظار التأهل" : "Awaiting qualification";
}

function getPreviewSlotSubtitle(slot: CompetitionPreviewSlot, isArabic: boolean) {
  if (slot.slotType === "bye") {
    return isArabic ? "يتقدم مباشرة إلى الجولة التالية" : "Advances automatically to the next round";
  }
  if (slot.slotType === "winner") {
    return isArabic ? "بانتظار حسم المباراة السابقة" : "Awaiting the previous matchup";
  }
  if (slot.sourceStatus === "confirmed" && slot.referenceLabel) {
    return isArabic ? `تأهل مؤكد: ${slot.referenceLabel}` : `Confirmed: ${slot.referenceLabel}`;
  }
  if (slot.sourceStatus === "projected" && slot.teamName) {
    return isArabic ? `الترتيب الحالي: ${slot.teamName}` : `Current leader: ${slot.teamName}`;
  }
  return isArabic ? "لم تُحسم المجموعة بعد" : "Group qualification is still in play";
}

function renderFixtureTitle(match: TournamentMatch, totalKnockoutRounds: number, isArabic: boolean) {
  if (match.stage === "group") {
    return isArabic
      ? `${match.groupId ? `المجموعة ${match.groupId} · ` : ""}جولة ${match.roundNumber} · مباراة ${match.matchNumber}`
      : `${match.groupId ? `Group ${match.groupId} · ` : ""}Round ${match.roundNumber} · Match ${match.matchNumber}`;
  }

  const roundLabel = getKnockoutRoundLabel(
    match.roundNumber,
    totalKnockoutRounds,
    isArabic,
    undefined,
  );
  return isArabic ? `${roundLabel} · مباراة ${match.matchNumber}` : `${roundLabel} · Match ${match.matchNumber}`;
}

function FixtureCard({
  match,
  isArabic,
  totalKnockoutRounds,
}: {
  match: TournamentMatch;
  isArabic: boolean;
  totalKnockoutRounds: number;
}) {
  const teams = [
    {
      id: match.teamAId,
      name: match.teamAName || (isArabic ? "سيحدد لاحقًا" : "TBD"),
      winner: Boolean(match.winnerTeamId && match.winnerTeamId === match.teamAId),
      scores: Array.isArray(match.scoreJson?.teamA) ? match.scoreJson.teamA : [],
    },
    {
      id: match.teamBId,
      name: match.teamBName || (isArabic ? "سيحدد لاحقًا" : "TBD"),
      winner: Boolean(match.winnerTeamId && match.winnerTeamId === match.teamBId),
      scores: Array.isArray(match.scoreJson?.teamB) ? match.scoreJson.teamB : [],
    },
  ];

  return (
    <article className="rounded-[1.6rem] border border-border/60 bg-background/85 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {renderFixtureTitle(match, totalKnockoutRounds, isArabic)}
          </p>
          <p className="text-xs text-muted-foreground">
            {match.courtName || match.courtNameEn || (isArabic ? "سيتم إعلان الملعب لاحقًا" : "Court will be announced")}
          </p>
        </div>
        <Badge className={getMatchStatusTone(match.status)}>{getMatchStatusLabel(match.status, isArabic)}</Badge>
      </div>

      <div className="mt-4 space-y-2">
        {teams.map((team, index) => (
          <div
            key={`${match.id}-${team.id || index}`}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-2.5",
              team.winner
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-border/60 bg-muted/30 text-muted-foreground",
            )}
          >
            <p className="truncate font-medium" title={team.name}>{team.name}</p>
            {team.scores.length ? (
              <span className="flex shrink-0 items-center gap-1 tabular-nums" aria-label={isArabic ? "نتيجة الفريق" : "Team set scores"}>
                {team.scores.map((score, scoreIndex) => (
                  <span key={scoreIndex} className="rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-bold text-foreground shadow-sm">
                    {score}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-xs font-bold tabular-nums text-foreground">vs</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        {match.startAt ? (
          <p className="inline-flex items-center gap-2">
            <Clock3 className="h-3.5 w-3.5" />
            {formatCompetitionDate(match.startAt, isArabic)}
          </p>
        ) : null}
        {match.winnerTeamName ? (
          <p className="inline-flex items-center gap-2 font-medium text-foreground">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            {isArabic ? "الفائز" : "Winner"}: {match.winnerTeamName}
          </p>
        ) : null}
        {match.status === "completed" ? <p>{getResultSummary(match, isArabic)}</p> : null}
      </div>
    </article>
  );
}

function PreviewBracket({
  rounds,
  totalRounds,
  isArabic,
}: {
  rounds: ReturnType<typeof deriveCompetitionState>["previewKnockoutRounds"];
  totalRounds: number;
  isArabic: boolean;
}) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-flex min-w-max items-start gap-4">
        {rounds.map((round) => (
          <section
            key={`preview-round-${round.roundNumber}`}
            className="w-[20rem] rounded-[1.8rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-4 shadow-sm dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.44),rgba(15,23,42,0.64))]"
          >
            <div className="mb-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                {getKnockoutRoundLabel(round.roundNumber, totalRounds, isArabic, round.matches.length)}
              </p>
              <p className="text-sm text-muted-foreground">
                {isArabic
                  ? `${round.matches.length} مباراة في انتظار التأكيد`
                  : `${round.matches.length} live matchup preview${round.matches.length === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="space-y-4">
              {round.matches.map((match) => (
                <article key={match.id} className="rounded-[1.45rem] border border-border/60 bg-background/80 p-3.5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {isArabic ? `مباراة ${match.matchNumber}` : `Match ${match.matchNumber}`}
                  </p>

                  <div className="space-y-2">
                    {match.slots.map((slot, index) => (
                      <div
                        key={`${match.id}-${index}-${slot.referenceLabel}`}
                        className={cn(
                          "rounded-2xl border px-3 py-3",
                          slot.sourceStatus === "confirmed"
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : slot.sourceStatus === "projected"
                              ? "border-sky-500/30 bg-sky-500/10"
                              : "border-border/60 bg-muted/30",
                        )}
                      >
                        <p className="text-sm font-semibold text-foreground">{getPreviewSlotTitle(slot, isArabic)}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {getPreviewSlotSubtitle(slot, isArabic)}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function StandingHeader({
  label,
  title,
  className,
}: {
  label: string;
  title: string;
  className?: string;
}) {
  return (
    <th className={className} title={title} aria-label={title}>
      {label}
    </th>
  );
}

export function CompetitionBoard({
  tournament,
  isArabic,
  className,
}: {
  tournament: Tournament;
  isArabic: boolean;
  className?: string;
}) {
  const competition = useMemo(
    () => deriveCompetitionState({ matches: tournament.matches || [], teams: tournament.teams || [] }),
    [tournament.matches, tournament.teams],
  );

  const groupMatchCount = competition.groupsState.reduce((total, group) => total + group.totalMatches, 0);
  const completedGroupMatchCount = competition.groupsState.reduce((total, group) => total + group.completedMatches, 0);
  const actualKnockoutMatchCount = competition.knockoutRounds.reduce((total, [, matches]) => total + matches.length, 0);
  const completedKnockoutMatchCount = competition.knockoutRounds.reduce(
    (total, [, matches]) => total + matches.filter((match) => match.status === "completed").length,
    0,
  );
  const projectedKnockoutMatchCount = competition.previewKnockoutRounds.reduce(
    (total, round) => total + round.matches.length,
    0,
  );

  if (
    competition.groupsState.length === 0 &&
    competition.knockoutRounds.length === 0 &&
    competition.previewKnockoutRounds.length === 0
  ) {
    return (
      <EmptyState
        title={isArabic ? "لم يبدأ نظام البطولة بعد" : "Competition board is waiting"}
        description={
          isArabic
            ? "اعتمد الفرق ثم أنشئ الشجرة ليظهر دور المجموعات والمواجهات الإقصائية تلقائيًا."
            : "Approve teams and generate the bracket to reveal the group stage and knockout path automatically."
        }
      />
    );
  }

  return (
    <div className={cn("space-y-6", className)} dir={isArabic ? "rtl" : "ltr"}>
      <Card className="overflow-hidden border-border/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(245,158,11,0.06),rgba(59,130,246,0.08))]">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                {isArabic ? "لوحة البطولة" : "Competition board"}
              </p>
              <CardTitle className="text-2xl">
                {isArabic ? "مرحلة المجموعات ثم الأدوار الإقصائية" : "Group stage into knockout flow"}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                {isArabic
                  ? "ترتيب المجموعات، المتأهلون، والشجرة الإقصائية كلها تتحرك مباشرة من نفس نتائج المباريات دون أي تحديث يدوي."
                  : "Group standings, qualifying teams, and the knockout bracket all react from the same match results without any manual refresh."}
              </CardDescription>
            </div>

            <Badge variant="outline" className="rounded-full border-white/60 bg-background/75 px-4 py-2">
              <Users className="h-4 w-4" />
              {isArabic
                ? `${competition.confirmedQualifiers.length} مؤكد / ${competition.qualificationSlots} مركز تأهل`
                : `${competition.confirmedQualifiers.length} confirmed / ${competition.qualificationSlots} slots`}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.3rem] border border-white/40 bg-background/80 p-4">
            <p className="text-sm text-muted-foreground">{isArabic ? "المجموعات" : "Groups"}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{competition.groupsState.length}</p>
          </div>

          <div className="rounded-[1.3rem] border border-white/40 bg-background/80 p-4">
            <p className="text-sm text-muted-foreground">{isArabic ? "مباريات المجموعات" : "Group matches"}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {completedGroupMatchCount}/{groupMatchCount}
            </p>
          </div>

          <div className="rounded-[1.3rem] border border-white/40 bg-background/80 p-4">
            <p className="text-sm text-muted-foreground">{isArabic ? "المتأهلون المؤكدون" : "Confirmed qualifiers"}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{competition.confirmedQualifiers.length}</p>
          </div>

          <div className="rounded-[1.3rem] border border-white/40 bg-background/80 p-4">
            <p className="text-sm text-muted-foreground">{isArabic ? "الأدوار الإقصائية" : "Knockout matches"}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {actualKnockoutMatchCount > 0
                ? `${completedKnockoutMatchCount}/${actualKnockoutMatchCount}`
                : projectedKnockoutMatchCount > 0
                  ? isArabic
                    ? `${projectedKnockoutMatchCount} متوقعة`
                    : `${projectedKnockoutMatchCount} projected`
                  : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {competition.groupsState.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
                {isArabic ? "مرحلة المجموعات" : "Group stage"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                {isArabic ? "جداول مباشرة ومباريات ذهاب كامل داخل كل مجموعة" : "Live tables with full round-robin fixtures"}
              </h2>
            </div>

            <Badge variant="outline">
              <CheckCircle2 className="h-4 w-4" />
              {isArabic ? "أفضل فريقين من كل مجموعة يتأهلان" : "Top 2 teams from each group qualify"}
            </Badge>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {competition.groupsState.map((group) => (
              <Card
                key={group.groupId}
                className="overflow-hidden border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.46),rgba(15,23,42,0.62))]"
              >
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{isArabic ? `المجموعة ${group.groupId}` : `Group ${group.groupId}`}</CardTitle>
                      <CardDescription>
                        {group.isComplete
                          ? isArabic
                            ? "تم حسم ترتيب المجموعة والتأهل."
                            : "This group is complete and qualification is locked."
                          : isArabic
                            ? "الترتيب الحالي يتغير فور تسجيل أي نتيجة."
                            : "Standings update instantly whenever a result changes."}
                      </CardDescription>
                    </div>

                    <Badge className={group.isComplete ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "bg-sky-500/10 text-sky-700 dark:text-sky-200"}>
                      {isArabic
                        ? `${group.completedMatches}/${group.totalMatches} مكتملة`
                        : `${group.completedMatches}/${group.totalMatches} complete`}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="overflow-x-auto rounded-xl">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <th className="w-9 pb-3 pe-3">#</th>
                          <th className="pb-3 pe-3">{isArabic ? "الفريق" : "Team"}</th>
                          <StandingHeader label={isArabic ? "ل" : "P"} title={isArabic ? "المباريات الملعوبة" : "Played"} className="w-8 pb-3 px-2 text-center" />
                          <StandingHeader label={isArabic ? "ف" : "W"} title={isArabic ? "الانتصارات" : "Wins"} className="w-8 pb-3 px-2 text-center" />
                          <StandingHeader label={isArabic ? "خ" : "L"} title={isArabic ? "الخسائر" : "Losses"} className="w-8 pb-3 px-2 text-center" />
                          <th className="w-12 pb-3 px-2 text-center">{isArabic ? "نقاط" : "PTS"}</th>
                          <th className="pb-3 px-2 text-center whitespace-nowrap">{isArabic ? "فارق الأشواط" : "Game Diff"}</th>
                          <th className="pb-3 px-2 text-center whitespace-nowrap">{isArabic ? "الأشواط المكتسبة" : "Games Won"}</th>
                          <th className="pb-3 ps-2 text-right whitespace-nowrap">{isArabic ? "الحالة" : "Status"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.standings.map((row) => (
                          <tr key={row.teamId} className="border-b border-border/40 last:border-b-0">
                            <td className="py-3 pe-3">
                              <span
                                className={cn(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                                  row.qualificationStatus === "qualified" || row.qualificationStatus === "leading"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {row.position}
                              </span>
                            </td>
                            <td className="py-3 pe-3">
                              <p className="font-medium leading-tight text-foreground">{row.teamName}</p>
                              {row.qualificationRank ? (
                                <p className="text-xs text-muted-foreground">
                                  {isArabic ? `مركز ${row.qualificationRank}` : `Place ${row.qualificationRank}`}
                                </p>
                              ) : null}
                            </td>
                            <td className="py-3 px-2 text-center tabular-nums">{row.played}</td>
                            <td className="py-3 px-2 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{row.wins}</td>
                            <td className="py-3 px-2 text-center tabular-nums text-rose-500 dark:text-rose-400">{row.losses}</td>
                            <td className="py-3 px-2 text-center tabular-nums font-semibold text-primary">{row.points}</td>
                            <td className="py-3 px-2 text-center tabular-nums">
                              {row.scoreDiff > 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                            </td>
                            <td className="py-3 px-2 text-center tabular-nums font-semibold">{row.pointsScored}</td>
                            <td className="py-3 ps-2 text-right">
                              <Badge className={getStandingTone(row)}>{getStandingLabel(row, isArabic)}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4 rounded-2xl bg-muted/50 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                    {isArabic
                      ? "الترتيب: الانتصارات · النقاط · فارق الأشواط · الأشواط المكتسبة · التصنيف / ترتيب القرعة"
                      : "Ranking: wins · PTS · game difference · games won · seed / draw order"}
                  </p>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {isArabic ? "مباريات المجموعة" : "Group fixtures"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isArabic
                            ? "كل فريق يواجه بقية فرق مجموعته مرة واحدة."
                            : "Every team plays each other team in the group once."}
                        </p>
                      </div>
                      <Badge variant="outline">
                        <Swords className="h-4 w-4" />
                        {isArabic ? `${group.totalMatches} مباراة` : `${group.totalMatches} matches`}
                      </Badge>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      {group.matches.map((match) => (
                        <FixtureCard
                          key={match.id}
                          match={match}
                          isArabic={isArabic}
                          totalKnockoutRounds={competition.totalKnockoutRounds}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
              {isArabic ? "الأدوار الإقصائية" : "Knockout stage"}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {competition.knockoutRounds.length > 0
                ? isArabic
                  ? "الشجرة الحية بنتائج حقيقية"
                  : "Live bracket powered by real results"
                : isArabic
                  ? "معاينة التأهل المباشرة قبل اكتمال المجموعات"
                  : "Live qualification preview before groups finish"}
            </h2>
          </div>

          <Badge variant="outline">
            <Trophy className="h-4 w-4" />
            {competition.knockoutRounds.length > 0
              ? isArabic
                ? `${actualKnockoutMatchCount} مباراة إقصائية`
                : `${actualKnockoutMatchCount} knockout matches`
              : isArabic
                ? "تحديث تلقائي حسب ترتيب المجموعات"
                : "Updates automatically from the group table"}
          </Badge>
        </div>

        {competition.knockoutRounds.length > 0 ? (
          <Card className="border-border/60 bg-background/95">
            <CardHeader>
              <CardTitle>{isArabic ? "الشجرة الإقصائية" : "Knockout bracket"}</CardTitle>
              <CardDescription>
                {isArabic
                  ? "بمجرد تسجيل النتيجة ينتقل الفائز تلقائيًا إلى الجولة التالية."
                  : "As soon as a result is recorded, the winner moves forward to the next round automatically."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <KnockoutBracket rounds={competition.knockoutRounds} isArabic={isArabic} />
            </CardContent>
          </Card>
        ) : competition.previewKnockoutRounds.length > 0 ? (
          <Card className="border-border/60 bg-background/95">
            <CardHeader>
              <CardTitle>{isArabic ? "معاينة الشجرة الإقصائية" : "Projected knockout bracket"}</CardTitle>
              <CardDescription>
                {isArabic
                  ? "الرموز مثل A1 و B2 تمثل مراكز التأهل. وعند اكتمال المجموعة تتحول تلقائيًا إلى أسماء الفرق المؤكدة."
                  : "Labels such as A1 and B2 represent qualification places. Once a group is complete they switch automatically to the confirmed team names."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <PreviewBracket
                rounds={competition.previewKnockoutRounds}
                totalRounds={competition.previewKnockoutRoundCount}
                isArabic={isArabic}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            title={isArabic ? "لا توجد مرحلة إقصائية بعد" : "No knockout stage yet"}
            description={
              isArabic
                ? "ستظهر معاينة الشجرة أو الشجرة الفعلية هنا بمجرد توفر مجموعات ومراكز تأهل."
                : "The live preview or real knockout bracket will appear here as soon as qualification slots exist."
            }
          />
        )}
      </section>
    </div>
  );
}
