import type { Tournament, TournamentMatch, TournamentTeam } from "@/lib/types";

export type CompetitionStandingStatus = "qualified" | "eliminated" | "leading" | "chasing";

export type CompetitionStandingRow = {
  teamId: string;
  teamName: string;
  groupId: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  scoreDiff: number;
  pointsScored: number;
  position: number;
  qualificationRank: number | null;
  qualificationStatus: CompetitionStandingStatus;
  seed?: number | null;
};

export type CompetitionGroupState = {
  groupId: string;
  matches: TournamentMatch[];
  standings: CompetitionStandingRow[];
  totalMatches: number;
  completedMatches: number;
  qualificationSlots: number;
  isComplete: boolean;
  qualifiedTeamIds: string[];
};

export type CompetitionPreviewSlot = {
  slotType: "qualifier" | "winner" | "bye" | "empty";
  referenceLabel: string;
  sourceStatus: "confirmed" | "projected" | "bye" | "empty";
  groupId?: string | null;
  qualificationRank?: number | null;
  teamId?: string | null;
  teamName?: string | null;
};

export type CompetitionPreviewMatch = {
  id: string;
  roundNumber: number;
  matchNumber: number;
  slots: [CompetitionPreviewSlot, CompetitionPreviewSlot];
};

export type CompetitionPreviewRound = {
  roundNumber: number;
  matches: CompetitionPreviewMatch[];
};

export type CompetitionFilter =
  | {
      value: "all";
      label: string;
      kind: "all";
      matches: TournamentMatch[];
    }
  | {
      value: `group:${string}`;
      label: string;
      kind: "group";
      groupId: string;
      matches: TournamentMatch[];
    }
  | {
      value: `round:${number}`;
      label: string;
      kind: "round";
      roundNumber: number;
      matches: TournamentMatch[];
    };

export type GroupedTournamentMatches = {
  groups: Array<[string, TournamentMatch[]]>;
  knockoutRounds: Array<[number, TournamentMatch[]]>;
  all: TournamentMatch[];
  totalKnockoutRounds: number;
};

export type CompetitionState = GroupedTournamentMatches & {
  groupsState: CompetitionGroupState[];
  previewKnockoutRounds: CompetitionPreviewRound[];
  previewKnockoutRoundCount: number;
  qualificationSlots: number;
  confirmedQualifiers: CompetitionStandingRow[];
  projectedQualifiers: CompetitionStandingRow[];
};

type CompetitionGroupEntry = {
  id: string;
  teamName: string;
  groupId: string;
  seed?: number | null;
  createdAt?: string | Date | null;
};

function isPowerOfTwo(value: number) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number) {
  let current = 1;
  while (current < value) current *= 2;
  return current;
}

const statusOrder: Record<string, number> = {
  pending: 0,
  scheduled: 1,
  completed: 2,
  cancelled: 3,
};

function stageOrder(match: TournamentMatch) {
  return match.stage === "group" ? 0 : 1;
}

function compareCompetitionText(left: string, right: string) {
  return String(left || "").localeCompare(String(right || ""), undefined, { numeric: true, sensitivity: "base" });
}

function getCompetitionSeed(team: Pick<TournamentTeam, "seed"> | CompetitionGroupEntry | null | undefined) {
  if (team?.seed == null) return Number.POSITIVE_INFINITY;
  const parsed = Number(team.seed);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getCreatedAtTime(value: string | Date | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function sortTeamsForCompetition<T extends { id: string; teamName?: string | null; seed?: number | null; createdAt?: string | Date | null }>(
  teams: T[],
) {
  return [...teams].sort((left, right) => {
    const seedDiff = getCompetitionSeed(left) - getCompetitionSeed(right);
    if (seedDiff !== 0) return seedDiff;

    const createdAtDiff = getCreatedAtTime(left.createdAt) - getCreatedAtTime(right.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;

    const nameDiff = compareCompetitionText(left.teamName || "", right.teamName || "");
    if (nameDiff !== 0) return nameDiff;

    return compareCompetitionText(left.id, right.id);
  });
}

function sumCompetitionScore(values: number[] | null | undefined) {
  return Array.isArray(values)
    ? values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0)
    : 0;
}

function countWonSets(values: number[], opponentValues: number[]) {
  let wonSets = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > opponentValues[index]) wonSets += 1;
  }
  return wonSets;
}

function getValidStandardScoreArrays(score: TournamentMatch["scoreJson"]) {
  const resultType = score?.resultType || "standard";
  if (resultType !== "standard") return null;

  const teamA = Array.isArray(score?.teamA) ? score.teamA : [];
  const teamB = Array.isArray(score?.teamB) ? score.teamB : [];

  if (teamA.length === 0 || teamA.length !== teamB.length) return null;

  const validTeamA = teamA.map(Number);
  const validTeamB = teamB.map(Number);

  const isValid = [...validTeamA, ...validTeamB].every(
    (value) => Number.isInteger(value) && value >= 0,
  );

  if (!isValid) return null;

  return { teamA: validTeamA, teamB: validTeamB };
}

function calculateCompetitionPoints(match: TournamentMatch, side: "teamA" | "teamB") {
  const score = match.scoreJson;
  const resultType = score?.resultType || "standard";
  if (resultType !== "standard") {
    const teamId = side === "teamA" ? match.teamAId : match.teamBId;
    return match.winnerTeamId && match.winnerTeamId === teamId ? 3 : 0;
  }

  const validArrays = getValidStandardScoreArrays(score);
  if (!validArrays) return 0;

  const values = side === "teamA" ? validArrays.teamA : validArrays.teamB;
  const opponentValues = side === "teamA" ? validArrays.teamB : validArrays.teamA;
  return countWonSets(values, opponentValues) * 3;
}

function compareCompetitionStandingRows(left: CompetitionStandingRow, right: CompetitionStandingRow) {
  if (left.wins !== right.wins) return right.wins - left.wins;
  if (left.points !== right.points) return right.points - left.points;
  if (left.scoreDiff !== right.scoreDiff) return right.scoreDiff - left.scoreDiff;
  if (left.pointsScored !== right.pointsScored) return right.pointsScored - left.pointsScored;

  const seedDiff = getCompetitionSeed(left) - getCompetitionSeed(right);
  if (seedDiff !== 0) return seedDiff;

  const nameDiff = compareCompetitionText(left.teamName, right.teamName);
  if (nameDiff !== 0) return nameDiff;

  return compareCompetitionText(left.teamId, right.teamId);
}

function collectCompetitionGroupEntries(
  teams: TournamentTeam[] = [],
  matches: TournamentMatch[] = [],
): CompetitionGroupEntry[] {
  const groupIdsByTeamId = new Map<string, string>();
  const namesByTeamId = new Map<string, string>();

  for (const match of matches) {
    if (match.stage !== "group" || !match.groupId) continue;

    if (match.teamAId) {
      groupIdsByTeamId.set(match.teamAId, match.groupId);
      if (match.teamAName) namesByTeamId.set(match.teamAId, match.teamAName);
    }
    if (match.teamBId) {
      groupIdsByTeamId.set(match.teamBId, match.groupId);
      if (match.teamBName) namesByTeamId.set(match.teamBId, match.teamBName);
    }
  }

  const entries = new Map<string, CompetitionGroupEntry>();

  for (const team of teams || []) {
    if (!team?.id) continue;
    const groupId = team.groupId || groupIdsByTeamId.get(team.id) || null;
    if (!groupId) continue;

    entries.set(team.id, {
      id: team.id,
      teamName: team.teamName || namesByTeamId.get(team.id) || team.id,
      groupId,
      seed: team.seed ?? null,
      createdAt: team.createdAt ?? null,
    });
  }

  for (const [teamId, groupId] of groupIdsByTeamId.entries()) {
    if (entries.has(teamId)) continue;

    entries.set(teamId, {
      id: teamId,
      teamName: namesByTeamId.get(teamId) || teamId,
      groupId,
      seed: null,
      createdAt: null,
    });
  }

  return sortTeamsForCompetition(Array.from(entries.values()));
}

function buildGroupStates(
  teams: TournamentTeam[] = [],
  matches: TournamentMatch[] = [],
): CompetitionGroupState[] {
  const rowsById = new Map<string, CompetitionStandingRow>();
  const groupsById = new Map<string, CompetitionStandingRow[]>();
  const entries = collectCompetitionGroupEntries(teams, matches);
  const groupedMatches = groupTournamentMatches(matches);
  const groupMatchesById = new Map(groupedMatches.groups);

  for (const entry of entries) {
    const row: CompetitionStandingRow = {
      teamId: entry.id,
      teamName: entry.teamName,
      groupId: entry.groupId,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      scoreDiff: 0,
      pointsScored: 0,
      position: 0,
      qualificationRank: null,
      qualificationStatus: "chasing",
      seed: entry.seed ?? null,
    };

    rowsById.set(entry.id, row);
    const groupRows = groupsById.get(entry.groupId) || [];
    groupRows.push(row);
    groupsById.set(entry.groupId, groupRows);
  }

  for (const match of matches || []) {
    if (match.stage !== "group" || match.status !== "completed") continue;

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

    const validArrays = getValidStandardScoreArrays(match.scoreJson);
    const teamAPoints = validArrays ? sumCompetitionScore(validArrays.teamA) : 0;
    const teamBPoints = validArrays ? sumCompetitionScore(validArrays.teamB) : 0;
    teamA.pointsScored += teamAPoints;
    teamB.pointsScored += teamBPoints;
    teamA.scoreDiff += teamAPoints - teamBPoints;
    teamB.scoreDiff += teamBPoints - teamAPoints;
  }

  return Array.from(groupsById.entries())
    .sort((left, right) => compareCompetitionText(left[0], right[0]))
    .map(([groupId, rows]) => {
      const standings = [...rows].sort(compareCompetitionStandingRows);
      const matchesInGroup = groupMatchesById.get(groupId) || [];
      const qualificationSlots = Math.min(2, standings.length);
      const completedMatches = matchesInGroup.filter((match) => match.status === "completed").length;
      const totalMatches = matchesInGroup.length;
      const isComplete = totalMatches > 0 && completedMatches === totalMatches;

      const normalizedStandings = standings.map((row, index) => {
        const qualified = index < qualificationSlots;
        const qualificationStatus: CompetitionStandingStatus = isComplete
          ? qualified
            ? "qualified"
            : "eliminated"
          : qualified
            ? "leading"
            : "chasing";

        return {
          ...row,
          position: index + 1,
          qualificationRank: qualified ? index + 1 : null,
          qualificationStatus,
        };
      });

      return {
        groupId,
        matches: matchesInGroup,
        standings: normalizedStandings,
        totalMatches,
        completedMatches,
        qualificationSlots,
        isComplete,
        qualifiedTeamIds: normalizedStandings
          .filter((row) => row.qualificationStatus === "qualified")
          .map((row) => row.teamId),
      } satisfies CompetitionGroupState;
    });
}

function buildCupStyleQualifierOrder(groupsState: CompetitionGroupState[] = []) {
  const orderedGroups = [...groupsState].sort((left, right) => compareCompetitionText(left.groupId, right.groupId));
  const orderedQualifiers: Array<CompetitionStandingRow & { qualificationRank: number }> = [];

  for (let index = 0; index < orderedGroups.length; index += 2) {
    const leftGroup = orderedGroups[index];
    const rightGroup = orderedGroups[index + 1];
    const leftFirst = leftGroup?.standings?.[0]
      ? { ...leftGroup.standings[0], qualificationRank: 1 }
      : null;
    const leftSecond = leftGroup?.standings?.[1]
      ? { ...leftGroup.standings[1], qualificationRank: 2 }
      : null;
    const rightFirst = rightGroup?.standings?.[0]
      ? { ...rightGroup.standings[0], qualificationRank: 1 }
      : null;
    const rightSecond = rightGroup?.standings?.[1]
      ? { ...rightGroup.standings[1], qualificationRank: 2 }
      : null;

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

function compareQualifiedTeamsForByes(
  left: CompetitionStandingRow & { qualificationRank: number },
  right: CompetitionStandingRow & { qualificationRank: number },
) {
  if ((left?.qualificationRank || 99) !== (right?.qualificationRank || 99)) {
    return (left?.qualificationRank || 99) - (right?.qualificationRank || 99);
  }

  return compareCompetitionStandingRows(left, right);
}

function buildQualifierPreviewSlot(
  row: CompetitionStandingRow | null | undefined,
  groupId: string | null | undefined,
  qualificationRank: number,
  confirmed: boolean,
): CompetitionPreviewSlot {
  return {
    slotType: "qualifier",
    referenceLabel: `${groupId || "?"}${qualificationRank}`,
    sourceStatus: row ? (confirmed ? "confirmed" : "projected") : "empty",
    groupId: groupId || null,
    qualificationRank,
    teamId: row?.teamId || null,
    teamName: row?.teamName || null,
  };
}

function buildCupStyleRoundOnePreviewPairs(groupsState: CompetitionGroupState[] = []) {
  const qualifiers = buildCupStyleQualifierOrder(groupsState);
  if (qualifiers.length < 2) return [];

  const bracketSize = nextPowerOfTwo(qualifiers.length);
  const byeCount = bracketSize - qualifiers.length;
  const byeTeamIds = new Set(
    qualifiers
      .slice()
      .sort(compareQualifiedTeamsForByes)
      .slice(0, byeCount)
      .map((team) => team.teamId),
  );
  const remaining = [...qualifiers];
  const pairs: Array<[CompetitionPreviewSlot | null, CompetitionPreviewSlot | null]> = [];

  while (remaining.length > 0) {
    const team = remaining.shift();
    if (!team) continue;

    const confirmed = groupsState.find((group) => group.groupId === team.groupId)?.isComplete ?? false;
    const teamSlot = buildQualifierPreviewSlot(team, team.groupId, team.qualificationRank || 1, confirmed);

    if (byeTeamIds.has(team.teamId)) {
      pairs.push([
        teamSlot,
        {
          slotType: "bye",
          referenceLabel: "BYE",
          sourceStatus: "bye",
        },
      ]);
      continue;
    }

    let opponentIndex = remaining.findIndex(
      (candidate) => candidate && !byeTeamIds.has(candidate.teamId) && candidate.groupId !== team.groupId,
    );
    if (opponentIndex === -1) {
      opponentIndex = remaining.findIndex((candidate) => candidate && !byeTeamIds.has(candidate.teamId));
    }

    if (opponentIndex === -1) {
      pairs.push([teamSlot, null]);
      continue;
    }

    const [opponent] = remaining.splice(opponentIndex, 1);
    const opponentConfirmed = groupsState.find((group) => group.groupId === opponent?.groupId)?.isComplete ?? false;
    pairs.push([
      teamSlot,
      opponent
        ? buildQualifierPreviewSlot(opponent, opponent.groupId, opponent.qualificationRank || 1, opponentConfirmed)
        : null,
    ]);
  }

  while (pairs.length < bracketSize / 2) {
    pairs.push([null, null]);
  }

  return pairs;
}

function buildPreviewKnockoutRounds(groupsState: CompetitionGroupState[] = []) {
  const roundOnePairs = buildCupStyleRoundOnePreviewPairs(groupsState);
  if (!roundOnePairs.length) return [];

  const totalRounds = Math.log2(roundOnePairs.length * 2);
  const rounds: CompetitionPreviewRound[] = [];
  let matchesThisRound = roundOnePairs.length;

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    const matches: CompetitionPreviewMatch[] = [];

    for (let matchIndex = 0; matchIndex < matchesThisRound; matchIndex += 1) {
      if (roundNumber === 1) {
        const [teamA, teamB] = roundOnePairs[matchIndex] || [null, null];
        matches.push({
          id: `preview-${roundNumber}-${matchIndex + 1}`,
          roundNumber,
          matchNumber: matchIndex + 1,
          slots: [
            teamA || {
              slotType: "empty",
              referenceLabel: "TBD",
              sourceStatus: "empty",
            },
            teamB || {
              slotType: teamA ? "bye" : "empty",
              referenceLabel: teamA ? "BYE" : "TBD",
              sourceStatus: teamA ? "bye" : "empty",
            },
          ],
        });
        continue;
      }

      matches.push({
        id: `preview-${roundNumber}-${matchIndex + 1}`,
        roundNumber,
        matchNumber: matchIndex + 1,
        slots: [
          {
            slotType: "winner",
            referenceLabel: String(matchIndex * 2 + 1),
            sourceStatus: "empty",
          },
          {
            slotType: "winner",
            referenceLabel: String(matchIndex * 2 + 2),
            sourceStatus: "empty",
          },
        ],
      });
    }

    rounds.push({ roundNumber, matches });
    matchesThisRound = Math.floor(matchesThisRound / 2);
  }

  return rounds;
}

export function sortCompetitionMatches(matches: TournamentMatch[]) {
  return [...matches].sort((left, right) => {
    const stageDiff = stageOrder(left) - stageOrder(right);
    if (stageDiff !== 0) return stageDiff;

    if ((left.groupId || "") !== (right.groupId || "")) {
      return compareCompetitionText(left.groupId || "", right.groupId || "");
    }

    const statusDiff = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;

    if (left.roundNumber !== right.roundNumber) return left.roundNumber - right.roundNumber;
    return left.matchNumber - right.matchNumber;
  });
}

export function groupTournamentMatches(matches: TournamentMatch[]): GroupedTournamentMatches {
  const groups = new Map<string, TournamentMatch[]>();
  const knockoutRounds = new Map<number, TournamentMatch[]>();

  for (const match of matches || []) {
    if (match.stage === "group") {
      const groupId = match.groupId || "?";
      const groupMatches = groups.get(groupId) || [];
      groupMatches.push(match);
      groups.set(groupId, groupMatches);
      continue;
    }

    const roundMatches = knockoutRounds.get(match.roundNumber) || [];
    roundMatches.push(match);
    knockoutRounds.set(match.roundNumber, roundMatches);
  }

  const grouped = {
    groups: Array.from(groups.entries())
      .sort((left, right) => compareCompetitionText(left[0], right[0]))
      .map(([groupId, groupMatches]) => [groupId, sortCompetitionMatches(groupMatches)] as const),
    knockoutRounds: Array.from(knockoutRounds.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([roundNumber, roundMatches]) => [roundNumber, sortCompetitionMatches(roundMatches)] as const),
    all: sortCompetitionMatches(matches || []),
    totalKnockoutRounds: 0,
  } satisfies GroupedTournamentMatches;

  grouped.totalKnockoutRounds = grouped.knockoutRounds.length
    ? grouped.knockoutRounds[grouped.knockoutRounds.length - 1][0]
    : 0;

  return grouped;
}

export function deriveCompetitionState(
  source: Pick<Tournament, "matches" | "teams"> | null | undefined,
): CompetitionState {
  const groupedMatches = groupTournamentMatches(source?.matches || []);
  const groupsState = buildGroupStates(source?.teams || [], source?.matches || []);
  const previewKnockoutRounds = buildPreviewKnockoutRounds(groupsState);
  const confirmedQualifiers = groupsState
    .flatMap((group) => group.standings.filter((row) => row.qualificationStatus === "qualified"));
  const projectedQualifiers = groupsState
    .flatMap((group) => group.standings.filter((row) => row.position <= group.qualificationSlots));

  return {
    ...groupedMatches,
    groupsState,
    previewKnockoutRounds,
    previewKnockoutRoundCount: previewKnockoutRounds.length
      ? previewKnockoutRounds[previewKnockoutRounds.length - 1].roundNumber
      : 0,
    qualificationSlots: groupsState.reduce((total, group) => total + group.qualificationSlots, 0),
    confirmedQualifiers,
    projectedQualifiers,
  };
}

export function getKnockoutRoundLabel(
  round: number,
  totalRounds: number,
  isArabic: boolean,
  roundMatchCount?: number,
): string {
  const safeRound = Number.isFinite(round) && round > 0 ? round : 1;

  if (Number.isFinite(roundMatchCount) && (roundMatchCount || 0) > 0) {
    const safeMatchCount = Math.max(1, Number(roundMatchCount));

    if (safeMatchCount === 1) return isArabic ? "النهائي" : "Final";
    if (safeMatchCount === 2) return isArabic ? "نصف النهائي" : "Semi-finals";
    if (safeMatchCount === 4) return isArabic ? "ربع النهائي" : "Quarter-finals";

    if (isPowerOfTwo(safeMatchCount)) {
      const teamsCount = safeMatchCount * 2;
      return isArabic ? `دور الـ${teamsCount}` : `Round of ${teamsCount}`;
    }

    return isArabic ? `الجولة ${safeRound}` : `Round ${safeRound}`;
  }

  const safeTotalRounds = Number.isFinite(totalRounds) && totalRounds >= safeRound ? totalRounds : safeRound;
  const matchesInRound = Math.max(1, 2 ** (safeTotalRounds - safeRound));

  if (matchesInRound === 1) return isArabic ? "النهائي" : "Final";
  if (matchesInRound === 2) return isArabic ? "نصف النهائي" : "Semi-finals";
  if (matchesInRound === 4) return isArabic ? "ربع النهائي" : "Quarter-finals";

  const teamsCount = matchesInRound * 2;
  return isArabic ? `دور الـ${teamsCount}` : `Round of ${teamsCount}`;
}

export function buildCompetitionFilters(matches: TournamentMatch[], isArabic: boolean): CompetitionFilter[] {
  const grouped = groupTournamentMatches(matches);
  const filters: CompetitionFilter[] = [
    {
      value: "all",
      label: isArabic ? "الكل" : "All",
      kind: "all",
      matches: grouped.all,
    },
  ];

  for (const [groupId, groupMatches] of grouped.groups) {
    filters.push({
      value: `group:${groupId}`,
      label: isArabic ? `المجموعة ${groupId}` : `Group ${groupId}`,
      kind: "group",
      groupId,
      matches: groupMatches,
    });
  }

  for (const [roundNumber, roundMatches] of grouped.knockoutRounds) {
    filters.push({
      value: `round:${roundNumber}`,
      label: getKnockoutRoundLabel(roundNumber, grouped.totalKnockoutRounds, isArabic, roundMatches.length),
      kind: "round",
      roundNumber,
      matches: roundMatches,
    });
  }

  return filters;
}
