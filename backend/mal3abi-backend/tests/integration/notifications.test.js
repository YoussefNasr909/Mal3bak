import request from "supertest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createEgyptDate } from "../../src/utils/date-utils.js";
import {
  ORIGIN,
  cookieFromLogin,
  loginUntilOk,
  seedAdmin,
  seedManagerWith24hCourt,
  seedPlayer,
  tomorrowDateStr,
} from "../helpers/integration-fixtures.js";

function buildTournamentPayload(courtId) {
  const targetDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();
  const startDate = createEgyptDate(year, month, day, 8, 0);
  const endDate = createEgyptDate(year, month, day, 23, 0);
  const registrationOpenAt = new Date(Date.now() - 60 * 60 * 1000);
  const registrationCloseAt = new Date(startDate.getTime() - 60 * 60 * 1000);

  return {
    title: `Notifications Cup ${Date.now()}`,
    titleAr: "ÙƒØ£Ø³ Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª",
    description: "Tournament notifications test",
    maxTeams: 4,
    entryFee: 100,
    registrationOpenAt: registrationOpenAt.toISOString(),
    registrationCloseAt: registrationCloseAt.toISOString(),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    rules: "Best of three sets",
    courtIds: [courtId],
  };
}

async function getNotifications(token, query = "") {
  return request(app)
    .get(`/api/v1/notifications${query ? `?${query}` : ""}`)
    .set("Origin", ORIGIN)
    .set("Cookie", [token]);
}

function cairoTodayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cairoRelativeDateStr(days) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

function cairoTimeStr(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

describe("Notifications", () => {
  it("creates booking notifications for the player and the court manager and supports read actions", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "notifications_booking_player");

    // This test covers the immediately-confirmed/cash notification path. Online-payment courts
    // now create a 15-minute hold and correctly defer this notification until settlement.
    await prisma.court.update({
      where: { id: manager.courtId },
      data: { allowOnlinePayment: false },
    });

    const createRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        courtId: manager.courtId,
        date: tomorrowDateStr(),
        startTime: "10:00",
        endTime: "11:00",
      });

    expect(createRes.status).toBe(201);

    const playerNotifications = await getNotifications(player.token);
    const managerNotifications = await getNotifications(manager.token);

    expect(playerNotifications.status).toBe(200);
    expect(playerNotifications.body.unreadCount).toBe(1);
    expect(playerNotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "Booking confirmed",
        }),
      ]),
    );

    expect(managerNotifications.status).toBe(200);
    expect(managerNotifications.body.unreadCount).toBe(1);
    expect(managerNotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "New booking received",
        }),
      ]),
    );

    const managerNotificationId = managerNotifications.body.items[0].id;
    const markReadRes = await request(app)
      .post(`/api/v1/notifications/${managerNotificationId}/read`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(markReadRes.status).toBe(200);
    expect(markReadRes.body.notification.readAt).toBeTruthy();
    expect(markReadRes.body.unreadCount).toBe(0);

    const markAllReadRes = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token]);

    expect(markAllReadRes.status).toBe(200);
    expect(markAllReadRes.body.unreadCount).toBe(0);

    const playerUnreadOnly = await getNotifications(player.token, "unreadOnly=true");
    expect(playerUnreadOnly.status).toBe(200);
    expect(playerUnreadOnly.body.items).toHaveLength(0);

    const deleteNotificationRes = await request(app)
      .delete(`/api/v1/notifications/${managerNotificationId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(deleteNotificationRes.status).toBe(200);
    expect(deleteNotificationRes.body.deletedId).toBe(managerNotificationId);

    const managerAfterDelete = await getNotifications(manager.token);
    expect(managerAfterDelete.body.items.some((item) => item.id === managerNotificationId)).toBe(false);

    const clearReadRes = await request(app)
      .delete("/api/v1/notifications")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token]);

    expect(clearReadRes.status).toBe(200);
    expect(clearReadRes.body.deletedCount).toBeGreaterThanOrEqual(1);

    const playerAfterClearRead = await getNotifications(player.token);
    expect(playerAfterClearRead.body.items).toHaveLength(0);
  });

  it("keeps in-app notifications always on in preferences and rejects writes to that flag", async () => {
    const player = await seedPlayer(app, "notifications_preferences_player");

    const initialPreferencesRes = await request(app)
      .get("/api/v1/notification-preferences")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token]);

    expect(initialPreferencesRes.status).toBe(200);
    expect(initialPreferencesRes.body.preferences.inAppEnabled).toBe(true);

    const invalidPatchRes = await request(app)
      .patch("/api/v1/notification-preferences")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        inAppEnabled: false,
      });

    expect(invalidPatchRes.status).toBe(400);

    const validPatchRes = await request(app)
      .patch("/api/v1/notification-preferences")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        criticalOnlyOnPush: false,
      });

    expect(validPatchRes.status).toBe(200);
    expect(validPatchRes.body.preferences).toEqual(
      expect.objectContaining({
        inAppEnabled: true,
        criticalOnlyOnPush: false,
      }),
    );
  });

  it("creates team registration and approval notifications", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "notifications_tournament_player");

    const createTournamentRes = await request(app)
      .post("/api/v1/tournaments")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send(buildTournamentPayload(manager.courtId));
    expect(createTournamentRes.status).toBe(201);
    const tournamentId = createTournamentRes.body.tournament.id;

    expect(
      (
        await request(app)
          .post(`/api/v1/tournaments/${tournamentId}/publish`)
          .set("Origin", ORIGIN)
          .set("Cookie", [manager.token])
          .send({})
      ).status,
    ).toBe(200);

    expect(
      (
        await request(app)
          .post(`/api/v1/tournaments/${tournamentId}/open-registration`)
          .set("Origin", ORIGIN)
          .set("Cookie", [manager.token])
          .send({})
      ).status,
    ).toBe(200);

    const registerRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        teamName: "Notification Ninjas",
        partnerName: "Partner One",
        partnerPhone: "01112345678",
        notes: "Ready for review",
      });

    expect(registerRes.status).toBe(201);

    const managerAfterRegister = await getNotifications(manager.token);
    const playerAfterRegister = await getNotifications(player.token);

    expect(managerAfterRegister.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tournament",
          title: "New team registration needs review",
        }),
      ]),
    );
    expect(playerAfterRegister.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tournament",
          title: "Team registration submitted",
        }),
      ]),
    );

    const approveRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${registerRes.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "Looks good" });

    expect(approveRes.status).toBe(200);

    const playerAfterApproval = await getNotifications(player.token);
    expect(playerAfterApproval.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tournament",
          title: "Team approved",
        }),
      ]),
    );
    expect(playerAfterApproval.body.unreadCount).toBeGreaterThanOrEqual(2);
  });

  it("notifies the next waitlisted team when a tournament slot opens", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const playerA = await seedPlayer(app, "notifications_waitlist_slot_a");
    const playerB = await seedPlayer(app, "notifications_waitlist_slot_b");
    const waitlistedPlayer = await seedPlayer(app, "notifications_waitlist_slot_waiting");

    const createTournamentRes = await request(app)
      .post("/api/v1/tournaments")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        ...buildTournamentPayload(manager.courtId),
        maxTeams: 2,
      teamsPerGroup: 2,
      });
    expect(createTournamentRes.status).toBe(201);
    const tournamentId = createTournamentRes.body.tournament.id;

    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/publish`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});
    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/open-registration`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});

    const teamA = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerA.token])
      .send({
        teamName: "Slot Team A",
        partnerName: "Partner A",
        partnerPhone: "01112345111",
      });
    const teamB = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerB.token])
      .send({
        teamName: "Slot Team B",
        partnerName: "Partner B",
        partnerPhone: "01112345222",
      });

    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);

    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamA.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "approved" });
    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamB.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "approved" });

    const waitlistRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/waitlist`)
      .set("Origin", ORIGIN)
      .set("Cookie", [waitlistedPlayer.token])
      .send({
        teamName: "Bench Squad",
        partnerName: "Bench Partner",
        partnerPhone: "01112345333",
      });

    expect(waitlistRes.status).toBe(201);

    const rejectRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamB.body.team.id}/reject`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "opened a slot" });

    expect(rejectRes.status).toBe(200);

    const waitlistedNotifications = await getNotifications(waitlistedPlayer.token);
    const managerNotifications = await getNotifications(manager.token);

    expect(waitlistedNotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tournament",
          title: "A tournament spot just opened",
        }),
      ]),
    );
    expect(managerNotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tournament",
          title: "Waitlist promotion is ready",
        }),
      ]),
    );
  });

  it("notifies both captains when a tournament bracket is generated and a match is scheduled", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const playerA = await seedPlayer(app, "notifications_bracket_a");
    const playerB = await seedPlayer(app, "notifications_bracket_b");

    const createTournamentRes = await request(app)
      .post("/api/v1/tournaments")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send(buildTournamentPayload(manager.courtId));
    expect(createTournamentRes.status).toBe(201);
    const tournamentId = createTournamentRes.body.tournament.id;

    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/publish`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});
    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/open-registration`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});

    const teamA = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerA.token])
      .send({
        teamName: "Alpha Team",
        partnerName: "Alpha Partner",
        partnerPhone: "01112345001",
      });
    const teamB = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerB.token])
      .send({
        teamName: "Beta Team",
        partnerName: "Beta Partner",
        partnerPhone: "01112345002",
      });

    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);

    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamA.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "approved" });
    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamB.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "approved" });

    const bracketRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/generate-bracket`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});

    expect(bracketRes.status).toBe(200);
    const scheduledMatch = bracketRes.body.tournament.matches.find(
      (match) => match.teamAId && match.teamBId,
    );
    expect(scheduledMatch).toBeTruthy();

    const matchDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const scheduleDate = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, "0")}-${String(matchDate.getDate()).padStart(2, "0")}`;
    const startAt = createEgyptDate(...scheduleDate.split("-").map(Number), 16, 0);
    const endAt = createEgyptDate(...scheduleDate.split("-").map(Number), 17, 0);

    const scheduleRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/matches/${scheduledMatch.id}/schedule`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        courtId: manager.courtId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });

    expect(scheduleRes.status).toBe(200);

    const playerANotifications = await getNotifications(playerA.token);
    const playerBNotifications = await getNotifications(playerB.token);

    for (const response of [playerANotifications, playerBNotifications]) {
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "tournament",
            title: "Tournament bracket is ready",
          }),
          expect.objectContaining({
            category: "tournament",
            title: "Match scheduled",
          }),
        ]),
      );
    }
  });

  it("notifies players when the tournament completes automatically after the final result", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const playerA = await seedPlayer(app, "notifications_auto_complete_a");
    const playerB = await seedPlayer(app, "notifications_auto_complete_b");

    const createTournamentRes = await request(app)
      .post("/api/v1/tournaments")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        ...buildTournamentPayload(manager.courtId),
        maxTeams: 2,
      teamsPerGroup: 2,
      });
    expect(createTournamentRes.status).toBe(201);
    const tournamentId = createTournamentRes.body.tournament.id;

    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/publish`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});
    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/open-registration`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});

    const teamA = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerA.token])
      .send({
        teamName: "Finalists A",
        partnerName: "Partner A",
        partnerPhone: "01112345444",
      });
    const teamB = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerB.token])
      .send({
        teamName: "Finalists B",
        partnerName: "Partner B",
        partnerPhone: "01112345555",
      });

    expect(teamA.status).toBe(201);
    expect(teamB.status).toBe(201);

    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamA.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "approved" });
    await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/teams/${teamB.body.team.id}/approve`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ notes: "approved" });

    const bracketRes = await request(app)
      .post(`/api/v1/tournaments/${tournamentId}/generate-bracket`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({});

    expect(bracketRes.status).toBe(200);
    let tournamentForResults = bracketRes.body.tournament;
    let completedAnyMatch = false;

    for (let index = 0; index < 5; index += 1) {
      const playableMatches = tournamentForResults.matches.filter(
        (item) => item.teamAId && item.teamBId && item.status !== "completed",
      );

      if (!playableMatches.length) {
        break;
      }

      const match =
        playableMatches.find((item) => item.stage === "knockout") ||
        playableMatches[0];

      const matchDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const scheduleDate = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, "0")}-${String(matchDate.getDate()).padStart(2, "0")}`;

      const startAt = createEgyptDate(
        ...scheduleDate.split("-").map(Number),
        16 + index,
        0,
      );
      const endAt = createEgyptDate(
        ...scheduleDate.split("-").map(Number),
        17 + index,
        0,
      );

      const scheduleRes = await request(app)
        .post(`/api/v1/tournaments/${tournamentId}/matches/${match.id}/schedule`)
        .set("Origin", ORIGIN)
        .set("Cookie", [manager.token])
        .send({
          courtId: manager.courtId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });

      expect(scheduleRes.status).toBe(200);

      const now = new Date();
      const completedStart = new Date(now.getTime() - (120 - index * 20) * 60 * 1000);
      const completedEnd = new Date(now.getTime() - (90 - index * 20) * 60 * 1000);

      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: {
          startAt: completedStart,
          endAt: completedEnd,
          status: "scheduled",
        },
      });

      const resultRes = await request(app)
        .post(`/api/v1/tournaments/${tournamentId}/matches/${match.id}/result`)
        .set("Origin", ORIGIN)
        .set("Cookie", [manager.token])
        .send({
          winnerTeamId: match.teamAId,
          score: {
            teamA: [6, 6],
            teamB: [3, 4],
            resultType: "standard",
          },
        });

      expect(resultRes.status).toBe(200);
      completedAnyMatch = true;

      const refreshedTournamentRes = await request(app)
        .get(`/api/v1/tournaments/${tournamentId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [manager.token]);

      expect(refreshedTournamentRes.status).toBe(200);
      tournamentForResults = refreshedTournamentRes.body.tournament;

      if (tournamentForResults.status === "completed") {
        break;
      }
    }

    expect(completedAnyMatch).toBe(true);
    expect(tournamentForResults.status).toBe("completed");
const playerANotifications = await getNotifications(playerA.token);
    expect(playerANotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tournament",
          title: "Tournament completed",
        }),
      ]),
    );
  });

  it("creates account notifications for profile updates and password changes", async () => {
    const player = await seedPlayer(app, "notifications_account_player");

    const profileRes = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        name: "Updated Player Name",
      });

    expect(profileRes.status).toBe(200);

    const afterProfile = await getNotifications(player.token);
    expect(afterProfile.status).toBe(200);
    expect(afterProfile.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "account",
          title: "Profile updated",
        }),
      ]),
    );

    const newPassword = "BetterPassword123";
    const changePasswordRes = await request(app)
      .put("/api/v1/auth/password")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        currentPassword: "Password123",
        newPassword,
      });

    expect(changePasswordRes.status).toBe(200);

    const reloginRes = await loginUntilOk(app, player.email, newPassword);
    expect(reloginRes.status).toBe(200);
    const refreshedToken = cookieFromLogin(reloginRes);

    const afterPasswordChange = await getNotifications(refreshedToken);
    expect(afterPasswordChange.status).toBe(200);
    expect(afterPasswordChange.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "account",
          title: "Password changed",
        }),
      ]),
    );
  });

  it("creates admin notifications for role changes, subscription changes, and reset links", async () => {
    const admin = await seedAdmin(app);
    const player = await seedPlayer(app, "notifications_admin_player");
    const manager = await seedManagerWith24hCourt(app);

    const roleRes = await request(app)
      .patch(`/api/v1/admin/users/${player.userId}/role`)
      .set("Origin", ORIGIN)
      .set("Cookie", [admin.token])
      .send({ role: "manager" });

    expect(roleRes.status).toBe(200);

    const subscriptionRes = await request(app)
      .patch(`/api/v1/admin/users/${manager.managerId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [admin.token])
      .send({ subscriptionPlan: "pro" });

    expect(subscriptionRes.status).toBe(200);

    const resetLinkRes = await request(app)
      .post(`/api/v1/admin/users/${manager.managerId}/reset-password-link`)
      .set("Origin", ORIGIN)
      .set("Cookie", [admin.token])
      .send({});

    expect(resetLinkRes.status).toBe(200);

    const playerNotifications = await getNotifications(player.token);
    const managerNotifications = await getNotifications(manager.token);

    expect(playerNotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "admin",
          title: "Role updated by admin",
        }),
      ]),
    );

    expect(managerNotifications.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "admin",
          title: "Subscription plan updated",
        }),
        expect.objectContaining({
          category: "admin",
          title: "Password reset link created by admin",
        }),
      ]),
    );
  });

  it("creates completion and automatic no-show notifications for booking lifecycle changes", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "notifications_booking_lifecycle_player");

    const bookingRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        courtId: manager.courtId,
        date: tomorrowDateStr(),
        startTime: "10:00",
        endTime: "11:00",
      });

    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.booking.id;

    const now = new Date();
    const checkInStart = new Date(now.getTime() + 5 * 60 * 1000);
    const checkInEnd = new Date(now.getTime() + 65 * 60 * 1000);

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: cairoTodayStr(),
        startTime: cairoTimeStr(checkInStart),
        endTime: cairoTimeStr(checkInEnd),
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        // A player-created booking at an online-payment court is now a pending 15-minute hold.
        // Check-in lifecycle coverage requires a settled booking, not an unpaid hold.
        status: "confirmed",
        paymentStatus: "paid",
        expiresAt: null,
      },
    });

    const checkInRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/check-in`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ lang: "en" });

    expect(checkInRes.status).toBe(200);

    const afterCheckIn = await getNotifications(player.token);
    expect(afterCheckIn.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "Booking completed",
        }),
      ]),
    );

    const noShowBookingRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        courtId: manager.courtId,
        date: tomorrowDateStr(),
        startTime: "12:00",
        endTime: "13:00",
      });

    expect(noShowBookingRes.status).toBe(201);
    const noShowBookingId = noShowBookingRes.body.booking.id;

    await prisma.booking.update({
      where: { id: noShowBookingId },
      data: {
        // Use a fully expired Cairo-local slot from yesterday so the test
        // stays stable even when it runs shortly after midnight.
        date: cairoRelativeDateStr(-1),
        startTime: "21:00",
        endTime: "22:00",
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        status: "confirmed",
        paymentStatus: "paid",
        expiresAt: null,
        checkInVerified: false,
        checkedIn: false,
        checkedInAt: null,
      },
    });

    const triggerNoShowRes = await request(app)
      .get(`/api/v1/bookings/${noShowBookingId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token]);

    expect(triggerNoShowRes.status).toBe(200);
    expect(triggerNoShowRes.body.booking.status).toBe("no_show");

    const playerAfterNoShow = await getNotifications(player.token);
    const managerAfterNoShow = await getNotifications(manager.token);

    expect(playerAfterNoShow.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "Missed booking",
        }),
      ]),
    );
    expect(managerAfterNoShow.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "Missed booking",
        }),
      ]),
    );
  });

  it("creates cancel notifications for the normal player booking flow", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "notifications_booking_player_actions");

    const bookingRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({
        courtId: manager.courtId,
        date: tomorrowDateStr(),
        startTime: "15:00",
        endTime: "16:00",
      });

    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.booking.id;

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token]);

    expect(cancelRes.status).toBe(200);

    const playerAfterCancel = await getNotifications(player.token);
    const managerAfterCancel = await getNotifications(manager.token);

    expect(playerAfterCancel.status).toBe(200);
    expect(managerAfterCancel.status).toBe(200);
    expect(playerAfterCancel.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "Booking cancelled",
        }),
      ]),
    );
    expect(managerAfterCancel.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "booking",
          title: "Booking cancelled on your court",
        }),
      ]),
    );
  });
});










