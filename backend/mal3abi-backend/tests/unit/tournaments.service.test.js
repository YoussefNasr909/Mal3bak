import { jest } from "@jest/globals";

import { prisma } from "../../src/db/prisma.js";
import { withdrawTournamentTeamService } from "../../src/modules/tournaments/tournaments.service.js";

describe("tournaments.service", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("blocks players from withdrawing another captain's team", async () => {
    jest.spyOn(prisma, "$transaction").mockImplementation(async (callback) =>
      callback({
        tournamentTeam: {
          findUnique: jest.fn().mockResolvedValue({
            id: "team-1",
            tournamentId: "tournament-1",
            captainUserId: "captain-1",
            teamName: "Protected Team",
            partnerName: "Partner",
            partnerPhone: "01111111111",
            status: "pending",
            seed: null,
            notes: null,
            createdAt: new Date("2026-04-05T10:00:00.000Z"),
            updatedAt: new Date("2026-04-05T10:00:00.000Z"),
            captain: {
              id: "captain-1",
              name: "Captain One",
              phone: "01111111111",
            },
            tournament: {
              id: "tournament-1",
              title: "Protected Cup",
              titleAr: "Protected Cup",
              managerId: "manager-1",
              status: "registration_open",
              registrationOpenAt: new Date(Date.now() - 60_000),
              registrationCloseAt: new Date(Date.now() + 60_000),
              startDate: new Date(Date.now() + 120_000),
              matches: [],
              teams: [{ id: "team-1", status: "pending" }],
              waitlistEntries: [],
            },
          }),
        },
      }),
    );

    await expect(
      withdrawTournamentTeamService("tournament-1", "team-1", {
        id: "player-2",
        role: "player",
      }),
    ).rejects.toMatchObject({
      message: "Only the team captain can withdraw this team",
      statusCode: 403,
    });
  });
});
