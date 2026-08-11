"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Trophy } from "lucide-react";

import type { TournamentMatch } from "@/lib/types";
import { getKnockoutRoundLabel } from "@/lib/tournaments/competition";
import { cn } from "@/lib/utils";

type BracketColumn = {
  roundNumber: number;
  label: string;
  matches: TournamentMatch[];
  slotHeight: number;
};

function getScoreLine(values: number[] | null | undefined) {
  return Array.isArray(values) && values.length > 0 ? values.join("-") : null;
}

function getMatchStatusLabel(status: TournamentMatch["status"], isArabic: boolean) {
  if (status === "completed") return isArabic ? "مكتملة" : "Completed";
  if (status === "scheduled") return isArabic ? "مجدولة" : "Scheduled";
  if (status === "cancelled") return isArabic ? "ملغاة" : "Cancelled";
  return isArabic ? "بانتظار التحديد" : "Pending";
}

function splitRoundMatches(matches: TournamentMatch[]) {
  const safe = Array.isArray(matches) ? matches : [];
  const midpoint = Math.ceil(safe.length / 2);
  return [safe.slice(0, midpoint), safe.slice(midpoint)] as const;
}

function buildTrackableTeams(rounds: [number, TournamentMatch[]][]) {
  const seen = new Set<string>();
  const teams: string[] = [];

  for (const [, matches] of (Array.isArray(rounds) ? rounds : [])) {
    for (const match of (Array.isArray(matches) ? matches : [])) {
      for (const name of [match.teamAName, match.teamBName]) {
        const trimmed = String(name || "").trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        teams.push(trimmed);
      }
    }
  }

  return teams;
}

function matchContainsTrackedTeam(match: TournamentMatch, trackedTeam: string | null) {
  if (!trackedTeam) return true;

  return [match.teamAName, match.teamBName, match.winnerTeamName].some(
    (value) => String(value || "").trim() === trackedTeam,
  );
}

function isStandardKnockoutShape(rounds: [number, TournamentMatch[]][]) {
  if (rounds.length === 0) return false;
  if (rounds[rounds.length - 1][1].length !== 1) return false;

  for (let index = 0; index < rounds.length - 1; index += 1) {
    const currentCount = rounds[index][1].length;
    const nextCount = rounds[index + 1][1].length;
    if (nextCount !== Math.max(1, Math.floor(currentCount / 2))) {
      return false;
    }
  }

  return true;
}

function BracketMatchCard({
  match,
  isArabic,
  isHighlightedRound,
  trackedTeam,
  compact = false,
}: {
  match: TournamentMatch;
  isArabic: boolean;
  isHighlightedRound: boolean;
  trackedTeam: string | null;
  compact?: boolean;
}) {
  const teamA = match.teamAName || (isArabic ? "سيحدد لاحقًا" : "TBD");
  const teamB = match.teamBName || (isArabic ? "سيحدد لاحقًا" : "TBD");
  const teamAScore = getScoreLine(match.scoreJson?.teamA);
  const teamBScore = getScoreLine(match.scoreJson?.teamB);
  const teamAWon = Boolean(match.winnerTeamId && match.winnerTeamId === match.teamAId);
  const teamBWon = Boolean(match.winnerTeamId && match.winnerTeamId === match.teamBId);
  const containsTrackedTeam = matchContainsTrackedTeam(match, trackedTeam);

  return (
    <article
      dir={isArabic ? "rtl" : "ltr"}
      className={cn(
        "w-[17rem] overflow-hidden rounded-[1.45rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,250,255,0.95))] shadow-[0_18px_36px_rgba(15,23,42,0.06)] transition-all duration-200 dark:bg-[linear-gradient(180deg,rgba(16,23,37,0.97),rgba(12,19,30,0.95))]",
        compact ? "w-full" : "",
        isHighlightedRound
          ? "border-[color:color-mix(in_oklab,var(--color-gold)_58%,var(--color-border))] shadow-[0_18px_42px_rgba(191,152,63,0.14)]"
          : "border-border/70",
        trackedTeam && !containsTrackedTeam && "opacity-50 saturate-75",
        trackedTeam && containsTrackedTeam && "border-primary/35 shadow-[0_18px_42px_rgba(37,99,235,0.14)]",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between border-b px-3.5 py-2.5",
          isHighlightedRound
            ? "border-[color:color-mix(in_oklab,var(--color-gold)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--color-gold)_14%,transparent)]"
            : "border-border/55 bg-[linear-gradient(180deg,rgba(37,99,235,0.06),transparent)]",
        )}
      >
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            {isArabic ? "مباراة" : "Match"}
          </p>
          <p className="text-[11px] font-medium text-muted-foreground">
            #{match.matchNumber}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
              match.status === "completed"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                : match.status === "scheduled"
                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-200"
                  : "bg-slate-500/10 text-slate-700 dark:text-slate-200",
            )}
          >
            {getMatchStatusLabel(match.status, isArabic)}
          </span>
          {isHighlightedRound ? <Trophy className="h-4 w-4 text-[color:var(--color-gold)]" /> : null}
        </div>
      </header>

      <div className="space-y-2 p-3">
        {[
          { name: teamA, score: teamAScore, winner: teamAWon },
          { name: teamB, score: teamBScore, winner: teamBWon },
        ].map((team, index) => (
          <div
            key={`${match.id}-${index}`}
            title={team.name}
            className={cn(
              "grid min-h-[3rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1rem] border px-3 py-2.5",
              team.winner
                ? "border-primary/30 bg-primary/12 text-foreground"
                : "border-border/55 bg-background/70 text-muted-foreground",
              trackedTeam && team.name === trackedTeam && "border-primary/45 bg-primary/16 shadow-sm",
            )}
          >
            <span className="truncate text-[0.95rem] font-medium">{team.name}</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                team.score ? "bg-background text-foreground shadow-sm" : "text-muted-foreground/70",
              )}
            >
              {team.score || (match.status === "completed" ? "—" : "vs")}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function BracketSide({
  columns,
  reverse,
  isArabic,
  trackedTeam,
}: {
  columns: BracketColumn[];
  reverse: boolean;
  isArabic: boolean;
  trackedTeam: string | null;
}) {
  if (columns.length === 0) return null;

  return (
    <div className={cn("inline-flex items-start gap-5", reverse ? "flex-row-reverse" : "flex-row")}>
      {columns.map((column) => (
        <div
          key={`${reverse ? "reverse" : "forward"}-${column.roundNumber}`}
          className={cn("inline-flex items-start gap-5", reverse ? "flex-row-reverse" : "flex-row")}
        >
          <div className="flex flex-col">
            <div className="mb-4 min-w-[17rem] space-y-1 px-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {column.label}
              </p>
              <p className="text-xs text-muted-foreground/80">
                {isArabic
                  ? `${column.matches.length} مباراة`
                  : `${column.matches.length} match${column.matches.length === 1 ? "" : "es"}`}
              </p>
            </div>

            {column.matches.map((match) => (
              <div key={match.id} style={{ height: `${column.slotHeight}px` }} className="flex items-center px-1">
                <BracketMatchCard
                  match={match}
                  isArabic={isArabic}
                  isHighlightedRound={false}
                  trackedTeam={trackedTeam}
                />
              </div>
            ))}
          </div>

          <div className="mt-9 flex flex-col">
            {column.matches.map((match, index) => (
              <div
                key={`${match.id}-connector`}
                style={{ height: `${column.slotHeight}px` }}
                className={cn(
                  "w-10",
                  index % 2 === 0
                    ? reverse
                      ? "border-s-2 border-t-2 border-primary/25"
                      : "border-e-2 border-t-2 border-primary/25"
                    : reverse
                      ? "border-b-2 border-s-2 border-primary/25"
                      : "border-e-2 border-b-2 border-primary/25",
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoundBoard({
  rounds,
  isArabic,
  trackedTeam,
  totalRounds,
}: {
  rounds: [number, TournamentMatch[]][];
  isArabic: boolean;
  trackedTeam: string | null;
  totalRounds: number;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-amber-300/40 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {isArabic
              ? "بيانات الشجرة الحالية لا تمثل مسارًا إقصائيًا نهائيًا واحدًا، لذلك يتم عرضها كجولات واضحة بدلًا من إجبارها على شكل نهائي غير صحيح."
              : "This knockout data does not form one clean single-elimination final path yet, so it is shown as clear round columns instead of forcing an incorrect finals view."}
          </p>
        </div>
      </div>

      <div className="inline-flex min-w-max items-start gap-4 px-1 py-2" dir={isArabic ? "rtl" : "ltr"}>
        {rounds.map(([roundNumber, matches]) => (
          <section
            key={`round-board-${roundNumber}`}
            className="w-[18.5rem] rounded-[1.7rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.92))] p-3 shadow-[0_16px_32px_rgba(15,23,42,0.05)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.46),rgba(15,23,42,0.62))]"
          >
            <div className="mb-3 space-y-1 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {getKnockoutRoundLabel(roundNumber, totalRounds, isArabic, matches.length)}
              </p>
              <p className="text-xs text-muted-foreground">
                {isArabic
                  ? `${matches.length} مباراة`
                  : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
              </p>
            </div>

            <div className="space-y-3">
              {matches.map((match) => (
                <BracketMatchCard
                  key={match.id}
                  match={match}
                  isArabic={isArabic}
                  isHighlightedRound={matches.length === 1}
                  trackedTeam={trackedTeam}
                  compact
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function KnockoutBracket({
  rounds,
  isArabic,
  className,
}: {
  rounds: [number, TournamentMatch[]][];
  isArabic: boolean;
  className?: string;
}) {
  const [trackedTeam, setTrackedTeam] = useState<string | null>(null);

  const teams = useMemo(() => buildTrackableTeams(rounds), [rounds]);
  const totalRounds = rounds.length > 0 ? rounds[rounds.length - 1][0] : 0;
  const isStandardShape = useMemo(() => isStandardKnockoutShape(rounds), [rounds]);

  useEffect(() => {
    if (trackedTeam && !teams.includes(trackedTeam)) {
      setTrackedTeam(null);
    }
  }, [teams, trackedTeam]);

  const baseSlotHeight = 196;

  const preparedColumns = useMemo(() => {
    if (!isStandardShape) return [];

    return rounds.slice(0, -1).map(([roundNumber, matches], columnIndex) => {
      const [leftMatches, rightMatches] = splitRoundMatches(matches);

      return {
        roundNumber,
        label: getKnockoutRoundLabel(roundNumber, totalRounds, isArabic, matches.length),
        leftMatches,
        rightMatches,
        slotHeight: baseSlotHeight * Math.pow(2, columnIndex),
      };
    });
  }, [baseSlotHeight, isArabic, isStandardShape, rounds, totalRounds]);

  const leftColumns = preparedColumns.map((column) => ({
    roundNumber: column.roundNumber,
    label: column.label,
    matches: column.leftMatches,
    slotHeight: column.slotHeight,
  }));

  const rightColumns = preparedColumns.map((column) => ({
    roundNumber: column.roundNumber,
    label: column.label,
    matches: column.rightMatches,
    slotHeight: column.slotHeight,
  }));

  const finalRound = rounds[rounds.length - 1];
  const finalSlotHeight = baseSlotHeight * Math.max(1, Math.pow(2, Math.max(0, rounds.length - 1)));

  if (!finalRound) return null;

  return (
    <div className={cn("min-w-0 max-w-full space-y-5 overflow-hidden", className)} dir={isArabic ? "rtl" : "ltr"}>
      {teams.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-[1.6rem] border border-border/60 bg-background/75 p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">
              {isArabic ? "عرض الشجرة" : "Bracket view"}
            </p>
            <p className="text-sm text-muted-foreground">
              {trackedTeam
                ? isArabic
                  ? `يتم الآن إبراز طريق ${trackedTeam} مع بقاء بقية المباريات واضحة للمقارنة.`
                  : `Now highlighting ${trackedTeam}'s route while keeping the rest of the bracket visible for comparison.`
                : isArabic
                  ? "اعرض الشجرة كاملة أو اختر فريقًا واحدًا لمتابعة طريقه مباراة بمباراة."
                  : "View the full bracket or pick one team to follow its route match by match."}
            </p>
          </div>

          <label className="flex min-w-[16rem] flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span>{isArabic ? "الفريق المتابع" : "Tracked team"}</span>
            <select
              value={trackedTeam ?? ""}
              onChange={(event) => setTrackedTeam(event.target.value || null)}
              className="h-11 rounded-2xl border border-border/60 bg-background px-4 text-sm font-medium normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/35"
            >
              <option value="">{isArabic ? "كل الفرق" : "All teams"}</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-[2rem] pb-4">
        <div className="w-max min-w-full rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(248,250,252,0.94))] p-4 shadow-[0_20px_45px_rgba(15,23,42,0.05)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.44),rgba(15,23,42,0.62))] sm:p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">
                {isArabic ? "الشجرة الإقصائية" : "Knockout bracket"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isStandardShape
                  ? isArabic
                    ? "مسار حديث وواضح حتى المباراة النهائية، مع إبراز النتائج بمجرد تسجيلها."
                    : "A clearer championship path with winners and scores surfaced as soon as results are recorded."
                  : isArabic
                    ? "تم الحفاظ على وضوح الجولات حتى لو كانت بيانات الشجرة الحالية غير مثالية."
                    : "The rounds stay readable even when the current bracket data is not perfectly structured."}
              </p>
            </div>

            <div className="rounded-full bg-primary/8 px-4 py-2 text-sm font-medium text-primary">
              {isArabic
                ? `${rounds.reduce((total, [, matches]) => total + matches.length, 0)} مباراة`
                : `${rounds.reduce((total, [, matches]) => total + matches.length, 0)} matches`}
            </div>
          </div>

          {isStandardShape ? (
            <div className="inline-flex min-w-max items-start gap-7 px-2 py-3" dir="ltr">
              <BracketSide columns={leftColumns} reverse={false} isArabic={isArabic} trackedTeam={trackedTeam} />

              <div className="flex flex-col">
                <div className="mb-4 min-w-[17rem] space-y-1 px-2 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {getKnockoutRoundLabel(finalRound[0], totalRounds, isArabic, finalRound[1].length)}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {isArabic
                      ? `${finalRound[1].length} مباراة`
                      : `${finalRound[1].length} match${finalRound[1].length === 1 ? "" : "es"}`}
                  </p>
                </div>

                {finalRound[1].map((match) => (
                  <div key={match.id} style={{ height: `${finalSlotHeight}px` }} className="flex items-center justify-center px-1">
                    <BracketMatchCard
                      match={match}
                      isArabic={isArabic}
                      isHighlightedRound
                      trackedTeam={trackedTeam}
                    />
                  </div>
                ))}
              </div>

              <BracketSide columns={rightColumns} reverse isArabic={isArabic} trackedTeam={trackedTeam} />
            </div>
          ) : (
            <RoundBoard rounds={rounds} isArabic={isArabic} trackedTeam={trackedTeam} totalRounds={totalRounds} />
          )}
        </div>
      </div>
    </div>
  );
}
