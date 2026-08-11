import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  listTournaments,
  getTournament,
  getPublicTournament,
  createTournament,
  deleteTournament,
  updateTournament,
  publishTournament,
  openTournamentRegistration,
  closeTournamentRegistration,
  registerTournamentTeam,
  joinTournamentWaitlist,
  withdrawTournamentWaitlistEntry,
  promoteNextTournamentWaitlistEntry,
  promoteTournamentWaitlistEntry,
  withdrawTournamentTeam,
  approveTournamentTeam,
  bulkReviewTournamentTeams,
  importTournamentTeams,
  rejectTournamentTeam,
  generateTournamentBracket,
  previewTournamentDraw,
  autoScheduleTournamentMatches,
  sendTournamentMatchReminder,
  checkInTournamentMatchTeam,
  scheduleTournamentMatch,
  recordTournamentMatchResult,
  cancelTournament,
  completeTournament,
} from "./tournaments.controller.js";
import {
  listTournamentsSchema,
  createTournamentSchema,
  updateTournamentSchema,
  registerTournamentTeamSchema,
  joinTournamentWaitlistSchema,
  updateTournamentTeamStatusSchema,
  bulkReviewTournamentTeamsSchema,
  importTournamentTeamsSchema,
  scheduleMatchSchema,
  recordMatchResultSchema,
  tournamentMatchCheckInSchema,
} from "./tournaments.validation.js";

const router = Router();

function validate(schema, property = "body") {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const err = new Error(error.details.map((d) => d.message).join(", "));
      err.statusCode = 400;
      return next(err);
    }
    if (property === "query") req.validatedQuery = value;
    else req[property] = value;
    next();
  };
}

router.get("/public/:tournamentId", getPublicTournament);

router.use(requireAuth);
router.get("/", requireRole("admin", "manager", "player"), validate(listTournamentsSchema, "query"), listTournaments);
router.get("/:tournamentId", requireRole("admin", "manager", "player"), getTournament);
router.post("/", requireRole("admin", "manager"), validate(createTournamentSchema), createTournament);
router.delete("/:tournamentId", requireRole("admin", "manager"), deleteTournament);
router.patch("/:tournamentId", requireRole("admin", "manager"), validate(updateTournamentSchema), updateTournament);
router.post("/:tournamentId/publish", requireRole("admin", "manager"), publishTournament);
router.post("/:tournamentId/open-registration", requireRole("admin", "manager"), openTournamentRegistration);
router.post("/:tournamentId/close-registration", requireRole("admin", "manager"), closeTournamentRegistration);
router.post("/:tournamentId/cancel", requireRole("admin", "manager"), cancelTournament);
router.post("/:tournamentId/complete", requireRole("admin", "manager"), completeTournament);
router.post("/:tournamentId/register", requireRole("player"), validate(registerTournamentTeamSchema), registerTournamentTeam);
router.post("/:tournamentId/waitlist", requireRole("player"), validate(joinTournamentWaitlistSchema), joinTournamentWaitlist);
router.delete("/:tournamentId/waitlist/:entryId", requireRole("admin", "manager", "player"), withdrawTournamentWaitlistEntry);
router.post("/:tournamentId/waitlist/promote-next", requireRole("admin", "manager"), promoteNextTournamentWaitlistEntry);
router.post("/:tournamentId/waitlist/:entryId/promote", requireRole("admin", "manager"), promoteTournamentWaitlistEntry);
router.delete("/:tournamentId/register/:teamId", requireRole("admin", "manager", "player"), withdrawTournamentTeam);
router.post("/:tournamentId/teams/:teamId/approve", requireRole("admin", "manager"), validate(updateTournamentTeamStatusSchema), approveTournamentTeam);
router.post("/:tournamentId/teams/:teamId/reject", requireRole("admin", "manager"), validate(updateTournamentTeamStatusSchema), rejectTournamentTeam);
router.post("/:tournamentId/teams/bulk-review", requireRole("admin", "manager"), validate(bulkReviewTournamentTeamsSchema), bulkReviewTournamentTeams);
router.post("/:tournamentId/teams/import", requireRole("admin", "manager"), validate(importTournamentTeamsSchema), importTournamentTeams);
router.get("/:tournamentId/draw-preview", requireRole("admin", "manager"), previewTournamentDraw);
router.post("/:tournamentId/generate-bracket", requireRole("admin", "manager"), generateTournamentBracket);
router.post("/:tournamentId/auto-schedule", requireRole("admin", "manager"), autoScheduleTournamentMatches);
router.post("/:tournamentId/matches/:matchId/schedule", requireRole("admin", "manager"), validate(scheduleMatchSchema), scheduleTournamentMatch);
router.post("/:tournamentId/matches/:matchId/reminder", requireRole("admin", "manager"), sendTournamentMatchReminder);
router.post("/:tournamentId/matches/:matchId/check-in", requireRole("admin", "manager"), validate(tournamentMatchCheckInSchema), checkInTournamentMatchTeam);
router.post("/:tournamentId/matches/:matchId/result", requireRole("admin", "manager"), validate(recordMatchResultSchema), recordTournamentMatchResult);

export default router;
