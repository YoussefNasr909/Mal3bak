import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createEgyptDate, getEgyptTodayString } from "../../src/utils/date-utils.js";
import {
  ORIGIN,
  createPlayerBooking,
  seedAdmin,
  seedPlayer,
  uniquePhone,
  waitForUserByEmail,
  waitForUserRole,
  promoteRoleById,
  loginUntilOk,
  cookieFromLogin,
}
from "../helpers/integration-fixtures.js";

jest.setTimeout(120000);

function addDaysToDateOnly(dateOnly, days) {
  const [year, month, day] = String(dateOnly).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function cairoDate(dateOnly, hour, minute = 0) {
  const [year, month, day] = String(dateOnly).split("-").map(Number);
  return createEgyptDate(year, month, day, hour, minute);
}

function defaultTeamsPerGroup(maxTeams) {
  const normalizedMaxTeams = Number(maxTeams) || 4;
  for (const size of [4, 3, 2]) {
    if (normalizedMaxTeams >= size && normalizedMaxTeams % size === 0) return size;
  }
  return normalizedMaxTeams;
}

function extractNumericSuffix(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortTeamsByNumericName(teams) {
  return [...teams].sort((left, right) => extractNumericSuffix(left.teamName) - extractNumericSuffix(right.teamName));
}

function buildWinningScore(match, winnerTeamId) {
  return winnerTeamId === match.teamAId
    ? { teamA: [6, 6], teamB: [3, 4] }
    : { teamA: [3, 4], teamB: [6, 6] };
}

async function recordCompletedMatch(managerToken, tournamentId, match, winnerTeamId) {
  return recordResult(managerToken, tournamentId, match.id, {
    winnerTeamId,
    score: buildWinningScore(match, winnerTeamId),
  });
}

async function seedManager(label = "manager") {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `${label}_${suffix}@example.com`;
  const reg = await request(app).post("/api/v1/auth/register").set("Origin", ORIGIN).send({
    name: `Manager ${label}`,
    email,
    phone: uniquePhone("010"),
    password: "Password123",
  });
  expect(reg.status).toBe(201);
  await waitForUserByEmail(reg.body.user.email);
  await promoteRoleById(reg.body.user.id, "manager");
  await waitForUserRole(reg.body.user.id, "manager");
  const login = await loginUntilOk(app, reg.body.user.email);
  expect(login.status).toBe(200);
  return {
    managerId: reg.body.user.id,
    email: reg.body.user.email,
    token: cookieFromLogin(login),
  };
}

async function createCourt(managerToken, overrides = {}) {
  const payload = {
    name: `Court ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    nameEn: `Court ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sportType: "padel",
    city: "Cairo",
    cityEn: "Cairo",
    peakPrice: 150,
    offPeakPrice: 100,
    openTime: "00:00",
    closeTime: "00:00",
    ...overrides,
  };
  const res = await request(app)
    .post("/api/v1/courts")
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send(payload);
  expect(res.status).toBe(201);
  return res.body.court;
}

function defaultTournamentPayload(courtIds, overrides = {}) {
  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
  const registrationOpenAt = new Date(Date.now() - 60 * 60 * 1000);
  const registrationCloseAt = new Date(startDate.getTime() - 60 * 60 * 1000);
  const maxTeams = overrides.maxTeams ?? 4;
  const teamsPerGroup = overrides.teamsPerGroup ?? defaultTeamsPerGroup(maxTeams);

  return {
    title: `Tournament ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    titleAr: "Ø¨Ø·ÙˆÙ„Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©",
    description: "Integration test tournament",
    maxTeams,
    teamsPerGroup,
    entryFee: 250,
    registrationOpenAt: registrationOpenAt.toISOString(),
    registrationCloseAt: registrationCloseAt.toISOString(),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    rules: "Best of three sets",
    courtIds,
    ...overrides,
  };
}

async function createTournament(token, courtIds, overrides = {}) {
  return request(app)
    .post("/api/v1/tournaments")
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send(defaultTournamentPayload(courtIds, overrides));
}

async function updateTournament(token, tournamentId, payload) {
  return request(app)
    .patch(`/api/v1/tournaments/${tournamentId}`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send(payload);
}

async function publishTournament(token, tournamentId) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/publish`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send({});
}

async function openRegistration(token, tournamentId) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/open-registration`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send({});
}

async function closeRegistration(token, tournamentId) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/close-registration`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send({});
}

async function registerTeam(playerToken, tournamentId, name = "Team A") {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/register`)
    .set("Origin", ORIGIN)
    .set("Cookie", [playerToken])
    .send({
      teamName: name,
      partnerName: `${name} Partner`,
      partnerPhone: uniquePhone("011"),
      notes: `${name} notes`,
    });
}

async function joinWaitlist(playerToken, tournamentId, name = "Waitlist Team") {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/waitlist`)
    .set("Origin", ORIGIN)
    .set("Cookie", [playerToken])
    .send({
      teamName: name,
      partnerName: `${name} Partner`,
      partnerPhone: uniquePhone("012"),
      notes: `${name} waitlist notes`,
    });
}

async function promoteWaitlistEntry(managerToken, tournamentId, entryId) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/waitlist/${entryId}/promote`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send({});
}

async function promoteNextWaitlistEntry(managerToken, tournamentId) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/waitlist/promote-next`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send({});
}

async function withdrawTeam(actorToken, tournamentId, teamId) {
  return request(app)
    .delete(`/api/v1/tournaments/${tournamentId}/register/${teamId}`)
    .set("Origin", ORIGIN)
    .set("Cookie", [actorToken]);
}

async function approveTeam(managerToken, tournamentId, teamId, notes = "approved") {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/teams/${teamId}/approve`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send({ notes });
}

async function rejectTeam(managerToken, tournamentId, teamId, notes = "rejected") {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/teams/${teamId}/reject`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send({ notes });
}

async function bulkReviewTeams(managerToken, tournamentId, payload) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/teams/bulk-review`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send(payload);
}

async function generateBracket(managerToken, tournamentId, payload = {}) {
  await closeRegistration(managerToken, tournamentId);
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/generate-bracket`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send(payload);
}

async function scheduleMatch(managerToken, tournamentId, matchId, payload) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/matches/${matchId}/schedule`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send(payload);
}

async function checkInMatchTeam(managerToken, tournamentId, matchId, payload) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/matches/${matchId}/check-in`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send(payload);
}

async function recordResult(managerToken, tournamentId, matchId, payload) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/matches/${matchId}/result`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send(payload);
}

async function cancelTournament(managerToken, tournamentId) {
  return request(app)
    .post(`/api/v1/tournaments/${tournamentId}/cancel`)
    .set("Origin", ORIGIN)
    .set("Cookie", [managerToken])
    .send({});
}

async function getTournament(token, tournamentId) {
  return request(app)
    .get(`/api/v1/tournaments/${tournamentId}`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token]);
}

async function listTournaments(token, query = "") {
  return request(app)
    .get(`/api/v1/tournaments${query ? `?${query}` : ""}`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token]);
}

async function getPublicTournament(tournamentId) {
  return request(app)
    .get(`/api/v1/tournaments/public/${tournamentId}`)
    .set("Origin", ORIGIN);
}

async function prepareTournamentWithApprovedTeams({ managerToken, courtIds, approvedCount = 2, maxTeams = 4, payloadOverrides = {} }) {
  const createRes = await createTournament(managerToken, courtIds, {
    maxTeams,
    ...payloadOverrides,
  });
  expect(createRes.status).toBe(201);
  const tournamentId = createRes.body.tournament.id;

  const publishRes = await publishTournament(managerToken, tournamentId);
  expect(publishRes.status).toBe(200);

  const openRes = await openRegistration(managerToken, tournamentId);
  expect(openRes.status).toBe(200);

  const players = [];
  const teams = [];
  for (let i = 0; i < approvedCount; i += 1) {
    const player = await seedPlayer(app, `tour_player_${i}`);
    players.push(player);
    const registerRes = await registerTeam(player.token, tournamentId, `Team ${i + 1}`);
    expect(registerRes.status).toBe(201);
    teams.push(registerRes.body.team);
    const approveRes = await approveTeam(managerToken, tournamentId, registerRes.body.team.id, `approve ${i + 1}`);
    expect(approveRes.status).toBe(200);
  }

  return { tournamentId, players, teams };
}

describe("Tournament feature regression and edge coverage", () => {
  it("allows a manager to create a draft tournament with their own courts", async () => {
    const manager = await seedManager("owner");
    const court = await createCourt(manager.token, { name: "Manager Court", nameEn: "Manager Court" });

    const res = await createTournament(manager.token, [court.id]);

    expect(res.status).toBe(201);
    expect(res.body.tournament.status).toBe("draft");
    expect(res.body.tournament.managerId).toBe(manager.managerId);
    expect(res.body.tournament.courts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: court.id, name: court.name, sportType: court.sportType }),
      ]),
    );
  });

  it("prevents a manager from creating a tournament with another manager's court", async () => {
    const ownerA = await seedManager("a");
    const ownerB = await seedManager("b");
    const foreignCourt = await createCourt(ownerB.token, { name: "Foreign Court", nameEn: "Foreign Court" });

    const res = await createTournament(ownerA.token, [foreignCourt.id]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or not accessible/i);
  });

  it("prevents an admin from mixing courts from different managers in one tournament", async () => {
    const admin = await seedAdmin(app);
    const ownerA = await seedManager("mixed_a");
    const ownerB = await seedManager("mixed_b");
    const courtA = await createCourt(ownerA.token, { name: "Court A", nameEn: "Court A" });
    const courtB = await createCourt(ownerB.token, { name: "Court B", nameEn: "Court B" });

    const res = await createTournament(admin.token, [courtA.id, courtB.id], { managerId: ownerA.managerId });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or not accessible/i);
  });

  it("hides draft tournaments from players but keeps them visible to the owning manager", async () => {
    const manager = await seedManager("visibility");
    const player = await seedPlayer(app, "visibility_player");
    const court = await createCourt(manager.token);
    const createRes = await createTournament(manager.token, [court.id]);
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    const managerFetch = await getTournament(manager.token, tournamentId);
    const playerFetch = await getTournament(player.token, tournamentId);
    const playerList = await listTournaments(player.token);

    expect(managerFetch.status).toBe(200);
    expect(managerFetch.body.tournament.id).toBe(tournamentId);
    expect(playerFetch.status).toBe(404);
    expect(playerList.status).toBe(200);
    expect(playerList.body.items.find((item) => item.id === tournamentId)).toBeUndefined();
  });

  it("does not expose draft tournaments on the public endpoint", async () => {
    const manager = await seedManager("public_draft_visibility");
    const court = await createCourt(manager.token);
    const createRes = await createTournament(manager.token, [court.id]);
    expect(createRes.status).toBe(201);

    const publicRes = await getPublicTournament(createRes.body.tournament.id);

    expect(publicRes.status).toBe(404);
    expect(publicRes.body.message).toMatch(/tournament not found/i);
  });

  it("supports register, duplicate-block, withdraw, and re-register flows while registration is open", async () => {
    const manager = await seedManager("regflow");
    const court = await createCourt(manager.token);
    const player = await seedPlayer(app, "regflow_player");
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 0,
    });

    const firstRegister = await registerTeam(player.token, tournamentId, "Repeatable Team");
    expect(firstRegister.status).toBe(201);

    const duplicate = await registerTeam(player.token, tournamentId, "Repeatable Team");
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toMatch(/already have a team registration/i);

    const withdrawRes = await withdrawTeam(player.token, tournamentId, firstRegister.body.team.id);
    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.body.team.status).toBe("withdrawn");

    const secondRegister = await registerTeam(player.token, tournamentId, "Repeatable Team Again");
    expect(secondRegister.status).toBe(201);
    expect(secondRegister.body.team.id).toBe(firstRegister.body.team.id);
    expect(secondRegister.body.team.status).toBe("pending");
  });

  it("prevents one player from withdrawing another player's team", async () => {
    const manager = await seedManager("withdraw_guard");
    const court = await createCourt(manager.token);
    const ownerPlayer = await seedPlayer(app, "withdraw_guard_owner");
    const otherPlayer = await seedPlayer(app, "withdraw_guard_other");
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 0,
    });

    const registerRes = await registerTeam(ownerPlayer.token, tournamentId, "Protected Team");
    expect(registerRes.status).toBe(201);

    const withdrawRes = await withdrawTeam(otherPlayer.token, tournamentId, registerRes.body.team.id);
    expect(withdrawRes.status).toBe(403);
    expect(withdrawRes.body.message).toMatch(/captain/i);

    const teamAfterAttempt = await prisma.tournamentTeam.findUnique({
      where: { id: registerRes.body.team.id },
      select: { status: true, captainUserId: true },
    });
    expect(teamAfterAttempt).toEqual(
      expect.objectContaining({
        status: "pending",
        captainUserId: ownerPlayer.userId,
      }),
    );
  });

  it("lets a rejected player submit an updated registration again while the window is still open", async () => {
    const manager = await seedManager("reapply_rejected");
    const court = await createCourt(manager.token);
    const player = await seedPlayer(app, "reapply_rejected_player");
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 0,
    });

    const registerRes = await registerTeam(player.token, tournamentId, "Original Team");
    expect(registerRes.status).toBe(201);

    const rejectRes = await rejectTeam(manager.token, tournamentId, registerRes.body.team.id, "Need better details");
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.team.status).toBe("rejected");

    const resubmitRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        teamName: "Updated Team",
        partnerName: "Updated Partner",
        partnerPhone: "+201111111111",
        notes: "updated registration",
      });

    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.team.id).toBe(registerRes.body.team.id);
    expect(resubmitRes.body.team.status).toBe("pending");
    expect(resubmitRes.body.team.teamName).toBe("Updated Team");
  });

  it("enforces max-team capacity and allows immediate registration when manager opens manually", async () => {
    const manager = await seedManager("window");
    const court = await createCourt(manager.token);
    const playerA = await seedPlayer(app, "window_a");
    const playerB = await seedPlayer(app, "window_b");
    const playerC = await seedPlayer(app, "window_c");

    // Tournament has a future registrationOpenAt, but manager manually opens registration —
    // the manual action takes precedence so players can register immediately.
    const createRes = await createTournament(manager.token, [court.id], {
      maxTeams: 2,
      registrationOpenAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      registrationCloseAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
    });
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;
    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    // Manager opened it — registration is live now regardless of registrationOpenAt
    const firstTeam = await registerTeam(playerA.token, tournamentId, "Full Team 1");
    expect(firstTeam.status).toBe(201);
    const secondTeam = await registerTeam(playerB.token, tournamentId, "Full Team 2");
    expect(secondTeam.status).toBe(201);

    // Tournament is now full — third player should be rejected
    const fullAttempt = await registerTeam(playerC.token, tournamentId, "Full Team 3");
    expect(fullAttempt.status).toBe(409);
    expect(fullAttempt.body.message).toMatch(/already full/i);
  });

  it("generates group-stage matches first and creates cup-style knockout pairings after all groups finish", async () => {
    const manager = await seedManager("group_knockout");
    const court = await createCourt(manager.token);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 16,
      maxTeams: 16,
      payloadOverrides: {
        teamsPerGroup: 4,
      },
    });

    const bracketRes = await generateBracket(manager.token, tournamentId);

    expect(bracketRes.status).toBe(200);
    expect(bracketRes.body.tournament.status).toBe("registration_closed");

    const approvedTeams = bracketRes.body.tournament.teams.filter((team) => team.status === "approved");
    const groupCounts = approvedTeams.reduce((counts, team) => {
      counts[team.groupId] = (counts[team.groupId] || 0) + 1;
      return counts;
    }, {});
    const groupMatches = bracketRes.body.tournament.matches.filter((match) => match.stage === "group");
    const knockoutMatches = bracketRes.body.tournament.matches.filter((match) => match.stage === "knockout");

    expect(Object.keys(groupCounts)).toEqual(["A", "B", "C", "D"]);
    expect(Object.values(groupCounts)).toEqual([4, 4, 4, 4]);
    expect(groupMatches).toHaveLength(24);
    expect(knockoutMatches).toHaveLength(0);

    const teamsByGroup = approvedTeams.reduce((groups, team) => {
      groups[team.groupId] = groups[team.groupId] || [];
      groups[team.groupId].push(team);
      return groups;
    }, {});
    let lastResultRes = null;

    for (const match of [...groupMatches].sort((left, right) => left.matchNumber - right.matchNumber)) {
      const orderedTeams = sortTeamsByNumericName(teamsByGroup[match.groupId] || []);
      const rankById = new Map(orderedTeams.map((team, index) => [team.id, index]));
      const winnerTeamId =
        (rankById.get(match.teamAId) ?? Number.MAX_SAFE_INTEGER) <= (rankById.get(match.teamBId) ?? Number.MAX_SAFE_INTEGER)
          ? match.teamAId
          : match.teamBId;

      lastResultRes = await recordCompletedMatch(manager.token, tournamentId, match, winnerTeamId);
      expect(lastResultRes.status).toBe(200);
    }

    const quarterFinals = lastResultRes.body.tournament.matches
      .filter((match) => match.stage === "knockout" && match.roundNumber === 1)
      .sort((left, right) => left.matchNumber - right.matchNumber);

    expect(quarterFinals).toHaveLength(4);
    expect(quarterFinals.map((match) => [match.teamAName, match.teamBName])).toEqual([
      ["Team 1", "Team 6"],
      ["Team 5", "Team 2"],
      ["Team 9", "Team 14"],
      ["Team 13", "Team 10"],
    ]);
  });

  it("persists the confirmed manual draw order as group membership and seeds", async () => {
    const manager = await seedManager("manual_draw_order");
    const court = await createCourt(manager.token);
    const createRes = await createTournament(manager.token, [court.id], {
      maxTeams: 8,
      teamsPerGroup: 4,
    });
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    const publishRes = await publishTournament(manager.token, tournamentId);
    expect(publishRes.status).toBe(200);
    const openRes = await openRegistration(manager.token, tournamentId);
    expect(openRes.status).toBe(200);

    const teams = [];
    for (let index = 0; index < 8; index += 1) {
      const captain = await prisma.user.create({
        data: {
          name: `Manual Draw Captain ${index + 1}`,
          email: `manual_draw_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}@example.com`,
          phone: uniquePhone("010"),
          password: "Password123",
          role: "player",
        },
      });
      const team = await prisma.tournamentTeam.create({
        data: {
          tournamentId,
          captainUserId: captain.id,
          teamName: `Team ${index + 1}`,
          partnerName: `Partner ${index + 1}`,
          status: "approved",
        },
      });
      teams.push(team);
    }

    const teamByName = new Map(teams.map((team) => [team.teamName, team]));
    const manualNames = [
      ["Team 8", "Team 1", "Team 6", "Team 3"],
      ["Team 2", "Team 7", "Team 4", "Team 5"],
    ];
    const drawGroups = manualNames.map((groupNames) => ({
      teamIds: groupNames.map((name) => teamByName.get(name).id),
    }));

    const bracketRes = await generateBracket(manager.token, tournamentId, {
      drawSeed: "manual-order-regression",
      drawGroups,
    });

    expect(bracketRes.status).toBe(200);

    const approvedTeams = bracketRes.body.tournament.teams.filter((team) => team.status === "approved");
    const seedById = new Map(approvedTeams.map((team) => [team.id, team.seed]));
    const groupById = new Map(approvedTeams.map((team) => [team.id, team.groupId]));
    const orderedIds = drawGroups.flatMap((group) => group.teamIds);

    expect(orderedIds.map((teamId) => seedById.get(teamId))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(drawGroups[0].teamIds.map((teamId) => groupById.get(teamId))).toEqual(["A", "A", "A", "A"]);
    expect(drawGroups[1].teamIds.map((teamId) => groupById.get(teamId))).toEqual(["B", "B", "B", "B"]);

    const firstGroupMatches = bracketRes.body.tournament.matches
      .filter((match) => match.stage === "group" && match.groupId === "A")
      .sort((left, right) => left.matchNumber - right.matchNumber)
      .slice(0, 2);

    expect(firstGroupMatches.map((match) => [match.teamAName, match.teamBName])).toEqual([
      ["Team 8", "Team 3"],
      ["Team 1", "Team 6"],
    ]);

    const reloadRes = await getTournament(manager.token, tournamentId);
    expect(reloadRes.status).toBe(200);
    const reloadedSeeds = new Map(
      reloadRes.body.tournament.teams
        .filter((team) => team.status === "approved")
        .map((team) => [team.id, team.seed]),
    );
    expect(orderedIds.map((teamId) => reloadedSeeds.get(teamId))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("breaks three-way group ties with score metrics when choosing the top two qualifiers", async () => {
    const manager = await seedManager("group_tie");
    const court = await createCourt(manager.token);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 4,
      maxTeams: 4,
      payloadOverrides: {
        teamsPerGroup: 4,
        registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      },
    });

    const bracketRes = await generateBracket(manager.token, tournamentId);
    expect(bracketRes.status).toBe(200);

    const groupMatches = [...bracketRes.body.tournament.matches]
      .filter((match) => match.stage === "group")
      .sort((left, right) => left.matchNumber - right.matchNumber);

    const resultsByPair = {
      "Team 1|Team 2": { winner: "Team 1", winnerScore: [6, 6], loserScore: [1, 1] },
      "Team 2|Team 3": { winner: "Team 2", winnerScore: [6, 6], loserScore: [4, 4] },
      "Team 1|Team 3": { winner: "Team 3", winnerScore: [7, 6], loserScore: [5, 4] },
      "Team 1|Team 4": { winner: "Team 1", winnerScore: [6, 6], loserScore: [3, 2] },
      "Team 2|Team 4": { winner: "Team 2", winnerScore: [6, 6], loserScore: [4, 3] },
      "Team 3|Team 4": { winner: "Team 3", winnerScore: [7, 6], loserScore: [5, 4] },
    };

    let lastResultRes = null;
    for (const match of groupMatches) {
      const pairKey = [match.teamAName, match.teamBName].sort().join("|");
      const setup = resultsByPair[pairKey];
      const winnerIsTeamA = match.teamAName === setup.winner;
      lastResultRes = await recordResult(manager.token, tournamentId, match.id, {
        winnerTeamId: winnerIsTeamA ? match.teamAId : match.teamBId,
        score: winnerIsTeamA
          ? { teamA: setup.winnerScore, teamB: setup.loserScore }
          : { teamA: setup.loserScore, teamB: setup.winnerScore },
      });
      expect(lastResultRes.status).toBe(200);
    }

    const finalMatch = lastResultRes.body.tournament.matches.find((match) => match.stage === "knockout");
    expect(finalMatch).toBeDefined();
    expect([finalMatch.teamAName, finalMatch.teamBName].sort()).toEqual(["Team 1", "Team 3"]);
  });

  it("blocks bracket generation until pending team requests are resolved", async () => {
    const manager = await seedManager("bracket_pending_guard");
    const court = await createCourt(manager.token);
    const waitingPlayer = await seedPlayer(app, "bracket_pending_waiting");
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      maxTeams: 4,
    });

    const pendingRegister = await registerTeam(waitingPlayer.token, tournamentId, "Pending Team");
    expect(pendingRegister.status).toBe(201);

    const bracketRes = await generateBracket(manager.token, tournamentId);

    expect(bracketRes.status).toBe(409);
    expect(bracketRes.body.message).toMatch(/resolve all pending team registrations/i);
  });

  it("blocks tournament schedule settings changes after a match has been scheduled", async () => {
    const manager = await seedManager("lock_update");
    const court = await createCourt(manager.token);
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 7);
    const tournamentStart = cairoDate(scheduleDate, 8, 0);
    const tournamentEnd = cairoDate(scheduleDate, 23, 59);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: tournamentStart.toISOString(),
        endDate: tournamentEnd.toISOString(),
        registrationCloseAt: cairoDate(scheduleDate, 7, 0).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;
    const startAt = cairoDate(scheduleDate, 10, 0);
    const endAt = cairoDate(scheduleDate, 11, 0);

    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    });
    expect(scheduleRes.status).toBe(200);

    const updateTimeline = await updateTournament(manager.token, tournamentId, {
      startDate: cairoDate(scheduleDate, 9, 0).toISOString(),
    });
    const replaceCourts = await updateTournament(manager.token, tournamentId, {
      courtIds: [court.id],
    });

    expect(updateTimeline.status).toBe(409);
    expect(updateTimeline.body.message).toMatch(/cannot be changed after matches have been scheduled/i);
    expect(replaceCourts.status).toBe(409);
    expect(replaceCourts.body.message).toMatch(/cannot be changed after matches have been scheduled/i);
  });

  it("rejects scheduling on courts not assigned to the tournament and outside court hours", async () => {
    const manager = await seedManager("schedule_rules");
    const assignedCourt = await createCourt(manager.token, { openTime: "08:00", closeTime: "21:00" });
    const extraCourt = await createCourt(manager.token, { openTime: "08:00", closeTime: "21:00" });
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 7);
    const startWindow = cairoDate(scheduleDate, 8, 0);
    const endWindow = cairoDate(addDaysToDateOnly(scheduleDate, 1), 1, 0);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [assignedCourt.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: startWindow.toISOString(),
        endDate: endWindow.toISOString(),
        registrationCloseAt: cairoDate(scheduleDate, 7, 0).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;

    const wrongCourt = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: extraCourt.id,
      startAt: cairoDate(scheduleDate, 10, 0).toISOString(),
      endAt: cairoDate(scheduleDate, 11, 0).toISOString(),
    });
    expect(wrongCourt.status).toBe(400);
    expect(wrongCourt.body.message).toMatch(/not assigned to this tournament/i);

    const lateNightStart = cairoDate(scheduleDate, 21, 0);
    const lateNightEnd = new Date(lateNightStart.getTime() + 3 * 60 * 60 * 1000);
    const outsideHours = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: assignedCourt.id,
      startAt: lateNightStart.toISOString(),
      endAt: lateNightEnd.toISOString(),
    });
    expect(outsideHours.status).toBe(409);
    expect(outsideHours.body.message).toMatch(/outside the court operating hours/i);
  });

  it("rejects scheduling a tournament match over an existing player booking", async () => {
    const manager = await seedManager("booking_conflict");
    const player = await seedPlayer(app, "booking_conflict_player");
    const court = await createCourt(manager.token, { openTime: "00:00", closeTime: "00:00" });
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 8);
    const tournamentStart = cairoDate(scheduleDate, 0, 0);
    const tournamentEnd = cairoDate(addDaysToDateOnly(scheduleDate, 1), 0, 0);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: tournamentStart.toISOString(),
        endDate: tournamentEnd.toISOString(),
        registrationCloseAt: new Date(tournamentStart.getTime() - 1000).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;

    const bookingRes = await createPlayerBooking(app, player.token, court.id, scheduleDate, "10:00", "11:00");
    expect(bookingRes.status).toBe(201);

    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: cairoDate(scheduleDate, 10, 0).toISOString(),
      endAt: cairoDate(scheduleDate, 11, 0).toISOString(),
    });

    expect(scheduleRes.status).toBe(409);
    expect(scheduleRes.body.message).toMatch(/player bookings in this time interval/i);
  });

  it("allows editing completed group results before knockout scheduling and blocks changes once knockout play starts", async () => {
    const manager = await seedManager("group_edit");
    const court = await createCourt(manager.token, { openTime: "00:00", closeTime: "00:00" });
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 4,
      maxTeams: 4,
      payloadOverrides: {
        teamsPerGroup: 4,
        registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      },
    });

    const bracketRes = await generateBracket(manager.token, tournamentId);
    expect(bracketRes.status).toBe(200);

    const groupMatches = [...bracketRes.body.tournament.matches]
      .filter((match) => match.stage === "group")
      .sort((left, right) => left.matchNumber - right.matchNumber);
    const firstMatch = groupMatches[0];

    const firstResult = await recordCompletedMatch(manager.token, tournamentId, firstMatch, firstMatch.teamAId);
    expect(firstResult.status).toBe(200);

    const editedResult = await recordCompletedMatch(manager.token, tournamentId, firstMatch, firstMatch.teamBId);
    expect(editedResult.status).toBe(200);
    expect(editedResult.body.match.winnerTeamId).toBe(firstMatch.teamBId);

    let latestTournament = editedResult.body.tournament;
    for (const match of groupMatches.slice(1)) {
      const orderedTeams = sortTeamsByNumericName(
        latestTournament.teams.filter((team) => team.status === "approved" && team.groupId === match.groupId),
      );
      const rankById = new Map(orderedTeams.map((team, index) => [team.id, index]));
      const winnerTeamId =
        (rankById.get(match.teamAId) ?? Number.MAX_SAFE_INTEGER) <= (rankById.get(match.teamBId) ?? Number.MAX_SAFE_INTEGER)
          ? match.teamAId
          : match.teamBId;

      const resultRes = await recordCompletedMatch(manager.token, tournamentId, match, winnerTeamId);
      expect(resultRes.status).toBe(200);
      latestTournament = resultRes.body.tournament;
    }

    const knockoutMatch = latestTournament.matches.find((match) => match.stage === "knockout");
    expect(knockoutMatch).toBeDefined();

    const scheduleRes = await scheduleMatch(manager.token, tournamentId, knockoutMatch.id, {
      courtId: court.id,
      startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(scheduleRes.status).toBe(200);

    const blockedEdit = await recordCompletedMatch(manager.token, tournamentId, firstMatch, firstMatch.teamAId);
    expect(blockedEdit.status).toBe(409);
    expect(blockedEdit.body.message).toMatch(/knockout matches have already been scheduled or completed/i);
  });

  it("rebuilds pending group structure changes before play starts and blocks them after scheduling begins", async () => {
    const manager = await seedManager("maxteams");
    const court = await createCourt(manager.token);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 4,
      maxTeams: 8,
      payloadOverrides: {
        teamsPerGroup: 4,
        registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      },
    });

    const shrinkBelowActive = await updateTournament(manager.token, tournamentId, { maxTeams: 2, teamsPerGroup: 2 });
    expect(shrinkBelowActive.status).toBe(409);
    expect(shrinkBelowActive.body.message).toMatch(/active registrations/i);

    const bracketRes = await generateBracket(manager.token, tournamentId);
    expect(bracketRes.status).toBe(200);
    expect(bracketRes.body.tournament.matches.filter((match) => match.stage === "group")).toHaveLength(6);

    const rebuildRes = await updateTournament(manager.token, tournamentId, { maxTeams: 4, teamsPerGroup: 2 });
    expect(rebuildRes.status).toBe(200);
    expect(rebuildRes.body.tournament.matches.filter((match) => match.stage === "group")).toHaveLength(2);
    expect(
      rebuildRes.body.tournament.teams
        .filter((team) => team.status === "approved")
        .reduce((counts, team) => {
          counts[team.groupId] = (counts[team.groupId] || 0) + 1;
          return counts;
        }, {}),
    ).toEqual({ A: 2, B: 2 });

    const firstMatch = rebuildRes.body.tournament.matches.find((match) => match.stage === "group");
    const scheduleRes = await scheduleMatch(manager.token, tournamentId, firstMatch.id, {
      courtId: court.id,
      startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(scheduleRes.status).toBe(200);

    const lockedRes = await updateTournament(manager.token, tournamentId, { maxTeams: 8, teamsPerGroup: 4 });
    expect(lockedRes.status).toBe(409);
    expect(lockedRes.body.message).toMatch(/matches have been scheduled/i);
  });

  it("releases reserved court closures and clears scheduled matches when a tournament is cancelled", async () => {
    const manager = await seedManager("cancel");
    const court = await createCourt(manager.token);
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 10);
    const tournamentStart = cairoDate(scheduleDate, 0, 0);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: tournamentStart.toISOString(),
        endDate: cairoDate(addDaysToDateOnly(scheduleDate, 1), 0, 0).toISOString(),
        registrationCloseAt: new Date(tournamentStart.getTime() - 1000).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;
    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: cairoDate(scheduleDate, 11, 0).toISOString(),
      endAt: cairoDate(scheduleDate, 12, 0).toISOString(),
    });
    expect(scheduleRes.status).toBe(200);
    const closureId = scheduleRes.body.match.closureId;
    expect(closureId).toBeTruthy();

    const cancelRes = await cancelTournament(manager.token, tournamentId);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.tournament.status).toBe("cancelled");

    const closure = await prisma.courtClosure.findUnique({ where: { id: closureId } });
    const refreshedMatch = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });

    expect(closure).toBeNull();
    expect(refreshedMatch.status).toBe("cancelled");
    expect(refreshedMatch.courtId).toBeNull();
    expect(refreshedMatch.closureId).toBeNull();
  });

  it("releases completed-match closures on tournament cancellation without wiping completed match history", async () => {
    const manager = await seedManager("cancel_completed");
    const court = await createCourt(manager.token);
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 10);
    const tournamentStart = cairoDate(scheduleDate, 0, 0);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: tournamentStart.toISOString(),
        endDate: cairoDate(addDaysToDateOnly(scheduleDate, 1), 0, 0).toISOString(),
        registrationCloseAt: new Date(tournamentStart.getTime() - 1000).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;
    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: cairoDate(scheduleDate, 13, 0).toISOString(),
      endAt: cairoDate(scheduleDate, 14, 0).toISOString(),
    });
    expect(scheduleRes.status).toBe(200);
    const closureId = scheduleRes.body.match.closureId;
    expect(closureId).toBeTruthy();

    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { status: "completed" },
    });

    const cancelRes = await cancelTournament(manager.token, tournamentId);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.tournament.status).toBe("cancelled");

    const closure = await prisma.courtClosure.findUnique({ where: { id: closureId } });
    const refreshedMatch = await prisma.tournamentMatch.findUnique({ where: { id: matchId } });

    expect(closure).toBeNull();
    expect(refreshedMatch.status).toBe("completed");
    expect(refreshedMatch.closureId).toBeNull();
    expect(refreshedMatch.courtId).toBe(court.id);
    expect(refreshedMatch.startAt).not.toBeNull();
    expect(refreshedMatch.endAt).not.toBeNull();
  });

  it("blocks shrinking court hours when scheduled tournament matches would no longer fit", async () => {
    const manager = await seedManager("court_hours");
    const court = await createCourt(manager.token, { openTime: "20:00", closeTime: "23:00" });
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 11);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: cairoDate(scheduleDate, 20, 0).toISOString(),
        endDate: cairoDate(addDaysToDateOnly(scheduleDate, 1), 0, 0).toISOString(),
        registrationCloseAt: cairoDate(scheduleDate, 19, 0).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;

    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: cairoDate(scheduleDate, 21, 0).toISOString(),
      endAt: cairoDate(scheduleDate, 22, 30).toISOString(),
    });
    expect(scheduleRes.status).toBe(200);

    const patchRes = await request(app)
      .patch(`/api/v1/courts/${court.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ openTime: "08:00", closeTime: "21:00" });

    expect(patchRes.status).toBe(409);
    expect(patchRes.body.message).toMatch(/invalidate scheduled tournament matches/i);
  });

  it("allows creating a tournament that spans beyond court hours, but blocks scheduling late-night matches outside those hours", async () => {
    const manager = await seedManager("overnight_policy");
    const court = await createCourt(manager.token, { openTime: "08:00", closeTime: "21:00" });
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 12);
    const startDate = cairoDate(scheduleDate, 21, 0);
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    const createRes = await createTournament(manager.token, [court.id], {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      registrationCloseAt: new Date(startDate.getTime() - 60 * 60 * 1000).toISOString(),
    });
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);
    const playerA = await seedPlayer(app, "overnight_a");
    const playerB = await seedPlayer(app, "overnight_b");
    const teamA = await registerTeam(playerA.token, tournamentId, "Night A");
    const teamB = await registerTeam(playerB.token, tournamentId, "Night B");
    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);
    expect((await approveTeam(manager.token, tournamentId, teamA.body.team.id)).status).toBe(200);
    expect((await approveTeam(manager.token, tournamentId, teamB.body.team.id)).status).toBe(200);
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;

    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
    });

    expect(scheduleRes.status).toBe(409);
    expect(scheduleRes.body.message).toMatch(/outside the court operating hours/i);
  });

  it("lets managers keep reviewing submitted teams after registration is closed", async () => {
    const manager = await seedManager("reject_lock");
    const court = await createCourt(manager.token);
    const player = await seedPlayer(app, "reject_lock_player");
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 0,
    });

    const registerRes = await registerTeam(player.token, tournamentId, "Reject Me");
    expect(registerRes.status).toBe(201);

    const rejectRes = await rejectTeam(manager.token, tournamentId, registerRes.body.team.id, "Missing docs");
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.team.status).toBe("rejected");

    const closeRes = await closeRegistration(manager.token, tournamentId);
    expect(closeRes.status).toBe(200);

    const approveAfterClose = await approveTeam(manager.token, tournamentId, registerRes.body.team.id, "late approval");
    expect(approveAfterClose.status).toBe(200);
    expect(approveAfterClose.body.team.status).toBe("approved");
  });

  it("supports bulk team review with one shared note", async () => {
    const manager = await seedManager("bulk_review");
    const court = await createCourt(manager.token);
    const playerA = await seedPlayer(app, "bulk_review_a");
    const playerB = await seedPlayer(app, "bulk_review_b");
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 0,
    });

    const teamA = await registerTeam(playerA.token, tournamentId, "Bulk Team A");
    const teamB = await registerTeam(playerB.token, tournamentId, "Bulk Team B");
    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);

    const bulkReviewRes = await bulkReviewTeams(manager.token, tournamentId, {
      teamIds: [teamA.body.team.id, teamB.body.team.id],
      status: "approved",
      notes: "Bulk approved for phase 2",
    });

    expect(bulkReviewRes.status).toBe(200);
    expect(bulkReviewRes.body.teams).toHaveLength(2);
    expect(bulkReviewRes.body.teams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: teamA.body.team.id, status: "approved", notes: "Bulk approved for phase 2" }),
        expect.objectContaining({ id: teamB.body.team.id, status: "approved", notes: "Bulk approved for phase 2" }),
      ]),
    );
  });

  it("allows managers to check teams in and clear the check-in later", async () => {
    const manager = await seedManager("match_checkin");
    const court = await createCourt(manager.token, { openTime: "00:00", closeTime: "00:00" });
    const scheduleDate = addDaysToDateOnly(getEgyptTodayString(), 8);
    const tournamentStart = cairoDate(scheduleDate, 0, 0);
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        startDate: tournamentStart.toISOString(),
        endDate: cairoDate(addDaysToDateOnly(scheduleDate, 1), 0, 0).toISOString(),
        registrationCloseAt: new Date(tournamentStart.getTime() - 1000).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;
    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: cairoDate(scheduleDate, 10, 0).toISOString(),
      endAt: cairoDate(scheduleDate, 11, 0).toISOString(),
    });
    expect(scheduleRes.status).toBe(200);

    const checkInRes = await checkInMatchTeam(manager.token, tournamentId, matchId, {
      teamId: scheduleRes.body.match.teamAId,
    });
    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.match.teamACheckedInAt).toBeTruthy();

    const clearRes = await checkInMatchTeam(manager.token, tournamentId, matchId, {
      teamId: scheduleRes.body.match.teamAId,
      checkedIn: false,
    });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.match.teamACheckedInAt).toBeNull();
  });

  it("stores walkover results without requiring set scores", async () => {
    const manager = await seedManager("walkover_result");
    const court = await createCourt(manager.token, { openTime: "00:00", closeTime: "00:00" });
    const { tournamentId } = await prepareTournamentWithApprovedTeams({
      managerToken: manager.token,
      courtIds: [court.id],
      approvedCount: 2,
      payloadOverrides: {
        registrationOpenAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      },
    });
    const bracketRes = await generateBracket(manager.token, tournamentId);
    const matchId = bracketRes.body.tournament.matches[0].id;
    const futureStart = new Date(Date.now() + 27 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 28 * 60 * 60 * 1000);
    const scheduleRes = await scheduleMatch(manager.token, tournamentId, matchId, {
      courtId: court.id,
      startAt: futureStart.toISOString(),
      endAt: futureEnd.toISOString(),
    });
    expect(scheduleRes.status).toBe(200);

    const pastStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() - 90 * 60 * 1000);
    await prisma.tournamentMatch.update({
      where: { id: matchId },
      data: { startAt: pastStart, endAt: pastEnd },
    });
    await prisma.courtClosure.updateMany({
      where: { tournamentMatch: { id: matchId } },
      data: { startDate: pastStart, endDate: pastEnd },
    });

    const resultRes = await recordResult(manager.token, tournamentId, matchId, {
      winnerTeamId: scheduleRes.body.match.teamAId,
      score: { resultType: "walkover", teamA: [], teamB: [] },
    });

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.match.scoreJson).toEqual(
      expect.objectContaining({
        resultType: "walkover",
        teamA: [],
        teamB: [],
      }),
    );
  });

  it("blocks re-activating a rejected team once the tournament is already at max active capacity", async () => {
    const manager = await seedManager("capacity_guard");
    const court = await createCourt(manager.token);
    const playerA = await seedPlayer(app, "capacity_guard_a");
    const playerB = await seedPlayer(app, "capacity_guard_b");
    const playerC = await seedPlayer(app, "capacity_guard_c");

    const createRes = await createTournament(manager.token, [court.id], {
      maxTeams: 2,
      registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      registrationCloseAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    const teamA = await registerTeam(playerA.token, tournamentId, "Capacity A");
    const teamB = await registerTeam(playerB.token, tournamentId, "Capacity B");
    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);

    expect((await rejectTeam(manager.token, tournamentId, teamA.body.team.id, "not ready")).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    const teamC = await registerTeam(playerC.token, tournamentId, "Capacity C");
    expect(teamC.status).toBe(201);

    const approveRejected = await approveTeam(manager.token, tournamentId, teamA.body.team.id, "bring back in");
    expect(approveRejected.status).toBe(409);
    expect(approveRejected.body.message).toMatch(/maximum active team capacity/i);
  });

  it("lets players join the waitlist and allows managers to promote them after a slot opens", async () => {
    const manager = await seedManager("waitlist_flow");
    const court = await createCourt(manager.token);
    const playerA = await seedPlayer(app, "waitlist_flow_a");
    const playerB = await seedPlayer(app, "waitlist_flow_b");
    const waitlistedPlayer = await seedPlayer(app, "waitlist_flow_waiting");

    const createRes = await createTournament(manager.token, [court.id], {
      maxTeams: 2,
      registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      registrationCloseAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    });
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    const teamA = await registerTeam(playerA.token, tournamentId, "Waitlist A");
    const teamB = await registerTeam(playerB.token, tournamentId, "Waitlist B");
    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);
    expect((await approveTeam(manager.token, tournamentId, teamA.body.team.id, "approved a")).status).toBe(200);
    expect((await approveTeam(manager.token, tournamentId, teamB.body.team.id, "approved b")).status).toBe(200);

    const waitlistRes = await joinWaitlist(waitlistedPlayer.token, tournamentId, "Bench Squad");
    expect(waitlistRes.status).toBe(201);
    expect(waitlistRes.body.entry.status).toBe("waiting");

    const rejectRes = await rejectTeam(manager.token, tournamentId, teamB.body.team.id, "make room from waitlist");
    expect(rejectRes.status).toBe(200);

    const promoteRes = await promoteWaitlistEntry(manager.token, tournamentId, waitlistRes.body.entry.id);
    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.entry.status).toBe("promoted");
    expect(promoteRes.body.team).toEqual(
      expect.objectContaining({
        teamName: "Bench Squad",
        status: "approved",
        captainUserId: waitlistedPlayer.userId,
      }),
    );
  });

  it("can promote the next waitlisted team with the helper endpoint", async () => {
    const manager = await seedManager("waitlist_promote_next");
    const court = await createCourt(manager.token);
    const playerA = await seedPlayer(app, "waitlist_promote_next_a");
    const playerB = await seedPlayer(app, "waitlist_promote_next_b");
    const waitlistedPlayer = await seedPlayer(app, "waitlist_promote_next_waiting");

    const createRes = await createTournament(manager.token, [court.id], {
      maxTeams: 2,
      registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      registrationCloseAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      startDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    });
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    const teamA = await registerTeam(playerA.token, tournamentId, "Helper A");
    const teamB = await registerTeam(playerB.token, tournamentId, "Helper B");
    expect((await approveTeam(manager.token, tournamentId, teamA.body.team.id, "approved a")).status).toBe(200);
    expect((await approveTeam(manager.token, tournamentId, teamB.body.team.id, "approved b")).status).toBe(200);

    const waitlistRes = await joinWaitlist(waitlistedPlayer.token, tournamentId, "Helper Bench");
    expect(waitlistRes.status).toBe(201);

    expect((await rejectTeam(manager.token, tournamentId, teamB.body.team.id, "open helper slot")).status).toBe(200);

    const promoteRes = await promoteNextWaitlistEntry(manager.token, tournamentId);
    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.entry.status).toBe("promoted");
    expect(promoteRes.body.team).toEqual(
      expect.objectContaining({
        teamName: "Helper Bench",
        status: "approved",
        captainUserId: waitlistedPlayer.userId,
      }),
    );
  });

  it("returns a public tournament view with only approved teams exposed", async () => {
    const manager = await seedManager("public_view");
    const court = await createCourt(manager.token);
    const playerApproved = await seedPlayer(app, "public_view_approved");
    const playerPending = await seedPlayer(app, "public_view_pending");

    const createRes = await createTournament(manager.token, [court.id]);
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    const approvedTeam = await registerTeam(playerApproved.token, tournamentId, "Approved Public");
    const pendingTeam = await registerTeam(playerPending.token, tournamentId, "Pending Private");
    expect(approvedTeam.status).toBe(201);
    expect(pendingTeam.status).toBe(201);
    expect((await approveTeam(manager.token, tournamentId, approvedTeam.body.team.id, "visible")).status).toBe(200);

    const publicRes = await getPublicTournament(tournamentId);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.tournament.teams).toEqual([
      expect.objectContaining({
        id: approvedTeam.body.team.id,
        teamName: "Approved Public",
        status: "approved",
      }),
    ]);
    expect(publicRes.body.tournament.waitlistEntries).toEqual([]);
  });

  it("shows players only approved teams plus their own non-public team", async () => {
    const manager = await seedManager("player_team_visibility");
    const court = await createCourt(manager.token);
    const playerApproved = await seedPlayer(app, "player_team_visibility_approved");
    const playerPending = await seedPlayer(app, "player_team_visibility_pending");
    const playerRejected = await seedPlayer(app, "player_team_visibility_rejected");

    const createRes = await createTournament(manager.token, [court.id]);
    expect(createRes.status).toBe(201);
    const tournamentId = createRes.body.tournament.id;

    expect((await publishTournament(manager.token, tournamentId)).status).toBe(200);
    expect((await openRegistration(manager.token, tournamentId)).status).toBe(200);

    const approvedTeam = await registerTeam(playerApproved.token, tournamentId, "Approved Visible");
    const pendingTeam = await registerTeam(playerPending.token, tournamentId, "Pending Mine");
    const rejectedTeam = await registerTeam(playerRejected.token, tournamentId, "Rejected Hidden");

    expect(approvedTeam.status).toBe(201);
    expect(pendingTeam.status).toBe(201);
    expect(rejectedTeam.status).toBe(201);
    expect((await approveTeam(manager.token, tournamentId, approvedTeam.body.team.id, "visible")).status).toBe(200);
    expect((await rejectTeam(manager.token, tournamentId, rejectedTeam.body.team.id, "hidden from players")).status).toBe(200);

    const playerView = await getTournament(playerPending.token, tournamentId);
    expect(playerView.status).toBe(200);
    expect(playerView.body.tournament.teams).toHaveLength(2);
    expect(playerView.body.tournament.teams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pendingTeam.body.team.id,
          teamName: "Pending Mine",
          status: "pending",
        }),
        expect.objectContaining({
          id: approvedTeam.body.team.id,
          teamName: "Approved Visible",
          status: "approved",
        }),
      ]),
    );
    expect(playerView.body.tournament.teams.some((team) => team.id === rejectedTeam.body.team.id)).toBe(false);
    expect(playerView.body.tournament.stats.totalTeams).toBe(2);
    expect(playerView.body.tournament.stats.pendingTeams).toBe(1);
  });
});

