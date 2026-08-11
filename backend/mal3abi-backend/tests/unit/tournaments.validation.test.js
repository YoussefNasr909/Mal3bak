import {
  createTournamentSchema,
  updateTournamentSchema,
  registerTournamentTeamSchema,
  scheduleMatchSchema,
} from "../../src/modules/tournaments/tournaments.validation.js";

function expectValid(result) {
  expect(result.error).toBeUndefined();
}

describe("Tournament validation schemas", () => {
  it("rejects create payloads where registration closes before it opens", () => {
    const result = createTournamentSchema.validate({
      title: "Test Tournament",
      maxTeams: 4,
      courtIds: ["550e8400-e29b-41d4-a716-446655440000"],
      registrationOpenAt: "2030-01-10T12:00:00.000Z",
      registrationCloseAt: "2030-01-10T11:00:00.000Z",
      startDate: "2030-01-11T12:00:00.000Z",
      endDate: "2030-01-12T12:00:00.000Z",
    });

    expect(result.error?.message).toMatch(/registrationCloseAt must be after registrationOpenAt/i);
  });

  it("rejects create payloads where registration closes after the tournament starts", () => {
    const result = createTournamentSchema.validate({
      title: "Test Tournament",
      maxTeams: 4,
      courtIds: ["550e8400-e29b-41d4-a716-446655440000"],
      registrationOpenAt: "2030-01-10T12:00:00.000Z",
      registrationCloseAt: "2030-01-11T13:00:00.000Z",
      startDate: "2030-01-11T12:00:00.000Z",
      endDate: "2030-01-12T12:00:00.000Z",
    });

    expect(result.error?.message).toMatch(/registrationCloseAt cannot be after startDate/i);
  });

  it("rejects update payloads where end date is before start date", () => {
    const result = updateTournamentSchema.validate({
      startDate: "2030-01-11T12:00:00.000Z",
      endDate: "2030-01-10T12:00:00.000Z",
    });

    expect(result.error?.message).toMatch(/endDate must be after startDate/i);
  });

  it("normalizes optional partner phone numbers for tournament registrations", () => {
    const result = registerTournamentTeamSchema.validate({
      teamName: "Cairo Smashers",
      partnerName: "Partner",
      partnerPhone: "0100 123 4567",
      notes: "Ready",
    });

    expectValid(result);
    expect(result.value.partnerPhone).toBe("01001234567");
  });

  it("rejects schedule payloads where endAt is not after startAt", () => {
    const result = scheduleMatchSchema.validate({
      courtId: "550e8400-e29b-41d4-a716-446655440000",
      startAt: "2030-01-11T12:00:00.000Z",
      endAt: "2030-01-11T12:00:00.000Z",
    });

    expect(result.error?.message).toMatch(/endAt must be after startAt/i);
  });

  it("accepts a minimal valid create payload with at least one court", () => {
    const result = createTournamentSchema.validate({
      title: "Solid Tournament",
      maxTeams: 4,
      courtIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });

    expectValid(result);
    expect(result.value.courtIds).toHaveLength(1);
  });
});
