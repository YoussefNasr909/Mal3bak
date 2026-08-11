import Joi from "joi";
import { normalizePhone } from "../../utils/phone.js";

const dateTimeSchema = Joi.date().iso();

export const listTournamentsSchema = Joi.object({
  q: Joi.string().allow(""),
  status: Joi.string().valid(
    "draft",
    "published",
    "registration_open",
    "registration_closed",
    "in_progress",
    "completed",
    "cancelled",
  ),
  mine: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid("createdAt", "startDate", "title", "status").default("createdAt"),
  order: Joi.string().valid("asc", "desc").default("desc"),
});

export const createTournamentSchema = Joi.object({
  title: Joi.string().min(2).max(160).required(),
  titleAr: Joi.string().allow("", null),
  description: Joi.string().allow("", null),
  descriptionAr: Joi.string().allow("", null),
  managerId: Joi.string().uuid().optional(),
  maxTeams: Joi.number().min(2).max(64).required(),
  teamsPerGroup: Joi.number().min(2).max(5).default(4),
  entryFee: Joi.number().min(0).allow(null),
  registrationOpenAt: dateTimeSchema.allow(null),
  registrationCloseAt: dateTimeSchema.allow(null),
  startDate: dateTimeSchema.allow(null),
  endDate: dateTimeSchema.allow(null),
  rules: Joi.string().allow("", null),
  coverImage: Joi.string().uri().allow("", null),
  courtIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
}).custom((value, helpers) => {
  if (value.registrationOpenAt && value.registrationCloseAt && new Date(value.registrationCloseAt) < new Date(value.registrationOpenAt)) {
    return helpers.message("registrationCloseAt must be after registrationOpenAt");
  }
  if (value.startDate && value.endDate && new Date(value.endDate) < new Date(value.startDate)) {
    return helpers.message("endDate must be after startDate");
  }
  if (value.registrationOpenAt && value.startDate && new Date(value.registrationOpenAt) > new Date(value.startDate)) {
    return helpers.message("registrationOpenAt cannot be after startDate");
  }
  if (value.registrationCloseAt && value.startDate && new Date(value.registrationCloseAt) > new Date(value.startDate)) {
    return helpers.message("registrationCloseAt cannot be after startDate");
  }
  if (value.maxTeams && value.teamsPerGroup && value.maxTeams % value.teamsPerGroup !== 0) {
    return helpers.message(`maxTeams (${value.maxTeams}) must be a multiple of teamsPerGroup (${value.teamsPerGroup})`);
  }
  return value;
});

export const updateTournamentSchema = Joi.object({
  title: Joi.string().min(2).max(160),
  titleAr: Joi.string().allow("", null),
  description: Joi.string().allow("", null),
  descriptionAr: Joi.string().allow("", null),
  maxTeams: Joi.number().min(2).max(64),
  teamsPerGroup: Joi.number().min(2).max(5),
  entryFee: Joi.number().min(0).allow(null),
  registrationOpenAt: dateTimeSchema.allow(null),
  registrationCloseAt: dateTimeSchema.allow(null),
  startDate: dateTimeSchema.allow(null),
  endDate: dateTimeSchema.allow(null),
  rules: Joi.string().allow("", null),
  coverImage: Joi.string().uri().allow("", null),
  courtIds: Joi.array().items(Joi.string().uuid()).min(1),
}).min(1).custom((value, helpers) => {
  if (value.registrationOpenAt && value.registrationCloseAt && new Date(value.registrationCloseAt) < new Date(value.registrationOpenAt)) {
    return helpers.message("registrationCloseAt must be after registrationOpenAt");
  }
  if (value.startDate && value.endDate && new Date(value.endDate) < new Date(value.startDate)) {
    return helpers.message("endDate must be after startDate");
  }
  return value;
});

export const registerTournamentTeamSchema = Joi.object({
  teamName: Joi.string().min(2).max(120).required(),
  partnerName: Joi.string().min(2).max(120).required(),
  partnerPhone: Joi.string().allow("", null).custom((value) => {
    if (value === "" || value === null || value === undefined) return null;
    return normalizePhone(value);
  }),
  notes: Joi.string().allow("", null),
});

export const joinTournamentWaitlistSchema = registerTournamentTeamSchema;

export const updateTournamentTeamStatusSchema = Joi.object({
  notes: Joi.string().allow("", null),
});

export const bulkReviewTournamentTeamsSchema = Joi.object({
  teamIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
  status: Joi.string().valid("approved", "rejected").required(),
  notes: Joi.string().allow("", null),
});

export const importTournamentTeamsSchema = Joi.object({
  mode: Joi.string().valid("active", "waitlist").default("active"),
  teams: Joi.array().items(Joi.object({
    teamName: Joi.string().min(2).max(120).required(),
    captainUserId: Joi.string().uuid().allow("", null),
    captainEmail: Joi.string().email().allow("", null),
    captainPhone: Joi.string().allow("", null).custom((value) => {
      if (value === "" || value === null || value === undefined) return null;
      return normalizePhone(value);
    }),
    captainName: Joi.string().min(2).max(160).allow("", null),
    partnerName: Joi.string().min(2).max(120).required(),
    partnerPhone: Joi.string().allow("", null).custom((value) => {
      if (value === "" || value === null || value === undefined) return null;
      return normalizePhone(value);
    }),
    notes: Joi.string().allow("", null),
    status: Joi.string().valid("pending", "approved").default("pending"),
  }).or("captainUserId", "captainEmail", "captainPhone", "captainName")).min(1).max(100).required(),
});

export const scheduleMatchSchema = Joi.object({
  courtId: Joi.string().uuid().required(),
  startAt: dateTimeSchema.required(),
  endAt: dateTimeSchema.required(),
}).custom((value, helpers) => {
  if (new Date(value.endAt) <= new Date(value.startAt)) {
    return helpers.message({ custom: "endAt must be after startAt" });
  }
  return value;
});

export const recordMatchResultSchema = Joi.object({
  winnerTeamId: Joi.string().uuid().required(),
  score: Joi.object({
    teamA: Joi.array().items(Joi.number().integer().min(0).max(999)).max(5).default([]),
    teamB: Joi.array().items(Joi.number().integer().min(0).max(999)).max(5).default([]),
    resultType: Joi.string().valid("standard", "walkover", "retired").default("standard"),
  })
    .optional()
    .custom((value, helpers) => {
      if (!value) return value;
      const teamA = Array.isArray(value.teamA) ? value.teamA : [];
      const teamB = Array.isArray(value.teamB) ? value.teamB : [];
      if (teamA.length !== teamB.length) {
        return helpers.message({ custom: "both teams must have the same number of set scores" });
      }
      if ((value.resultType || "standard") === "standard" && teamA.length === 0) {
        return helpers.message({ custom: "standard results require at least one set score" });
      }
      return value;
    }),
});

export const tournamentMatchCheckInSchema = Joi.object({
  teamId: Joi.string().uuid().required(),
  checkedIn: Joi.boolean().default(true),
});
