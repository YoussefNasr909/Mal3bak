import { describe, expect, it } from "vitest";

import {
  buildCompetitionFilters,
  deriveCompetitionState,
  getKnockoutRoundLabel,
  groupTournamentMatches,
} from "@/lib/tournaments/competition";

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    stage: "knockout",
    roundNumber: 1,
    matchNumber: 1,
    status: "pending",
    ...overrides,
  } as any;
}

describe("tournament competition helpers", () => {
  it("returns real knockout round names in English and Arabic", () => {
    expect(getKnockoutRoundLabel(1, 4, false)).toBe("Round of 16");
    expect(getKnockoutRoundLabel(2, 4, false)).toBe("Quarter-finals");
    expect(getKnockoutRoundLabel(3, 4, false)).toBe("Semi-finals");
    expect(getKnockoutRoundLabel(4, 4, false)).toBe("Final");

    expect(getKnockoutRoundLabel(1, 4, true)).toBe("دور الـ16");
    expect(getKnockoutRoundLabel(2, 4, true)).toBe("ربع النهائي");
    expect(getKnockoutRoundLabel(3, 4, true)).toBe("نصف النهائي");
    expect(getKnockoutRoundLabel(4, 4, true)).toBe("النهائي");
  });

  it("groups group-stage and knockout matches into ordered filters", () => {
    const matches = [
      makeMatch({
        id: "group-b",
        stage: "group",
        groupId: "B",
        roundNumber: 1,
        matchNumber: 2,
      }),
      makeMatch({
        id: "semi-1",
        stage: "knockout",
        roundNumber: 1,
        matchNumber: 1,
      }),
      makeMatch({
        id: "semi-2",
        stage: "knockout",
        roundNumber: 1,
        matchNumber: 2,
      }),
      makeMatch({
        id: "group-a",
        stage: "group",
        groupId: "A",
        roundNumber: 1,
        matchNumber: 1,
      }),
      makeMatch({
        id: "final",
        stage: "knockout",
        roundNumber: 2,
        matchNumber: 1,
      }),
    ];

    const grouped = groupTournamentMatches(matches);
    const filters = buildCompetitionFilters(matches, false);

    expect(grouped.groups.map(([groupId]) => groupId)).toEqual(["A", "B"]);
    expect(grouped.knockoutRounds.map(([roundNumber]) => roundNumber)).toEqual([1, 2]);
    expect(grouped.totalKnockoutRounds).toBe(2);
    expect(filters.map((filter) => filter.label)).toEqual(["All", "Group A", "Group B", "Semi-finals", "Final"]);
  });

  it("builds live standings, qualifiers, and projected knockout slots from shared source data", () => {
    const state = deriveCompetitionState({
      teams: [
        { id: "team-a", teamName: "Falcons", groupId: "A", status: "approved", seed: 1 },
        { id: "team-b", teamName: "Sharks", groupId: "A", status: "approved", seed: 2 },
        { id: "team-c", teamName: "Waves", groupId: "A", status: "approved", seed: 3 },
        { id: "team-d", teamName: "Lions", groupId: "A", status: "approved", seed: 4 },
        { id: "team-e", teamName: "Storm", groupId: "B", status: "approved", seed: 5 },
        { id: "team-f", teamName: "Comets", groupId: "B", status: "approved", seed: 6 },
        { id: "team-g", teamName: "Orbit", groupId: "B", status: "approved", seed: 7 },
        { id: "team-h", teamName: "Nova", groupId: "B", status: "approved", seed: 8 },
      ] as any,
      matches: [
        makeMatch({
          id: "a-1",
          stage: "group",
          groupId: "A",
          roundNumber: 1,
          matchNumber: 1,
          status: "completed",
          teamAId: "team-a",
          teamAName: "Falcons",
          teamBId: "team-b",
          teamBName: "Sharks",
          winnerTeamId: "team-a",
          scoreJson: { teamA: [6, 6], teamB: [3, 4] },
        }),
        makeMatch({
          id: "a-2",
          stage: "group",
          groupId: "A",
          roundNumber: 1,
          matchNumber: 2,
          status: "completed",
          teamAId: "team-c",
          teamAName: "Waves",
          teamBId: "team-d",
          teamBName: "Lions",
          winnerTeamId: "team-c",
          scoreJson: { teamA: [6, 7], teamB: [4, 5] },
        }),
        makeMatch({
          id: "a-3",
          stage: "group",
          groupId: "A",
          roundNumber: 2,
          matchNumber: 3,
          status: "pending",
          teamAId: "team-a",
          teamAName: "Falcons",
          teamBId: "team-c",
          teamBName: "Waves",
        }),
        makeMatch({
          id: "b-1",
          stage: "group",
          groupId: "B",
          roundNumber: 1,
          matchNumber: 4,
          status: "completed",
          teamAId: "team-e",
          teamAName: "Storm",
          teamBId: "team-f",
          teamBName: "Comets",
          winnerTeamId: "team-e",
          scoreJson: { teamA: [6, 6], teamB: [2, 3] },
        }),
        makeMatch({
          id: "b-2",
          stage: "group",
          groupId: "B",
          roundNumber: 1,
          matchNumber: 5,
          status: "completed",
          teamAId: "team-g",
          teamAName: "Orbit",
          teamBId: "team-h",
          teamBName: "Nova",
          winnerTeamId: "team-h",
          scoreJson: { teamA: [4, 6], teamB: [6, 7] },
        }),
        makeMatch({
          id: "b-3",
          stage: "group",
          groupId: "B",
          roundNumber: 2,
          matchNumber: 6,
          status: "pending",
          teamAId: "team-e",
          teamAName: "Storm",
          teamBId: "team-h",
          teamBName: "Nova",
        }),
      ] as any,
    });

    expect(state.groupsState).toHaveLength(2);
    expect(state.groupsState[0].standings.slice(0, 2).map((row) => row.teamName)).toEqual(["Falcons", "Waves"]);
    expect(state.groupsState[0].standings[0].qualificationStatus).toBe("leading");
    expect(state.groupsState[1].standings.slice(0, 2).map((row) => row.teamName)).toEqual(["Storm", "Nova"]);
    expect(state.previewKnockoutRounds[0].matches[0].slots[0].referenceLabel).toBe("A1");
    expect(state.previewKnockoutRounds[0].matches[0].slots[1].referenceLabel).toBe("B2");
    expect(state.previewKnockoutRounds[0].matches[0].slots[0].teamName).toBe("Falcons");
  });

  it("awards 3 PTS per set won and breaks ties by wins, PTS, game difference, and games won", () => {
    const state = deriveCompetitionState({
      teams: [
        { id: "team-a", teamName: "Falcons", groupId: "A", status: "approved", seed: 1 },
        { id: "team-b", teamName: "Sharks", groupId: "A", status: "approved", seed: 2 },
        { id: "team-c", teamName: "Waves", groupId: "A", status: "approved", seed: 3 },
        { id: "team-d", teamName: "Lions", groupId: "A", status: "approved", seed: 4 },
      ] as any,
      matches: [
        makeMatch({
          id: "tie-1",
          stage: "group",
          groupId: "A",
          roundNumber: 1,
          matchNumber: 1,
          status: "completed",
          teamAId: "team-a",
          teamAName: "Falcons",
          teamBId: "team-b",
          teamBName: "Sharks",
          winnerTeamId: "team-a",
          scoreJson: { teamA: [6, 6], teamB: [0, 1] },
        }),
        makeMatch({
          id: "tie-2",
          stage: "group",
          groupId: "A",
          roundNumber: 1,
          matchNumber: 2,
          status: "completed",
          teamAId: "team-b",
          teamAName: "Sharks",
          teamBId: "team-c",
          teamBName: "Waves",
          winnerTeamId: "team-b",
          scoreJson: { teamA: [6, 6], teamB: [3, 4] },
        }),
        makeMatch({
          id: "tie-3",
          stage: "group",
          groupId: "A",
          roundNumber: 1,
          matchNumber: 3,
          status: "completed",
          teamAId: "team-c",
          teamAName: "Waves",
          teamBId: "team-a",
          teamBName: "Falcons",
          winnerTeamId: "team-c",
          scoreJson: { teamA: [6, 7], teamB: [4, 5] },
        }),
        makeMatch({
          id: "tie-4",
          stage: "group",
          groupId: "A",
          roundNumber: 2,
          matchNumber: 4,
          status: "completed",
          teamAId: "team-d",
          teamAName: "Lions",
          teamBId: "team-a",
          teamBName: "Falcons",
          winnerTeamId: "team-a",
          scoreJson: { teamA: [3, 2], teamB: [6, 6] },
        }),
        makeMatch({
          id: "tie-5",
          stage: "group",
          groupId: "A",
          roundNumber: 2,
          matchNumber: 5,
          status: "completed",
          teamAId: "team-d",
          teamAName: "Lions",
          teamBId: "team-b",
          teamBName: "Sharks",
          winnerTeamId: "team-b",
          scoreJson: { teamA: [4, 3], teamB: [6, 6] },
        }),
        makeMatch({
          id: "tie-6",
          stage: "group",
          groupId: "A",
          roundNumber: 2,
          matchNumber: 6,
          status: "completed",
          teamAId: "team-d",
          teamAName: "Lions",
          teamBId: "team-c",
          teamBName: "Waves",
          winnerTeamId: "team-c",
          scoreJson: { teamA: [5, 4], teamB: [7, 6] },
        }),
      ] as any,
    });

    const standings = state.groupsState[0].standings;
    expect(standings.map((row) => row.teamName)).toEqual(["Falcons", "Waves", "Sharks", "Lions"]);
    expect(standings[0].points).toBe(12);
    expect(standings[3].points).toBe(0);
    expect(standings[0].wins).toBe(2);
    expect(standings[1].wins).toBe(2);
    expect(standings[2].wins).toBe(2);
    expect(standings[0].scoreDiff).toBeGreaterThan(standings[1].scoreDiff);
    expect(standings[1].scoreDiff).toBeGreaterThan(standings[2].scoreDiff);
  });
});
