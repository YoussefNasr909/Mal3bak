import {
  listTournamentsService,
  getTournamentByIdService,
  getPublicTournamentByIdService,
  createTournamentService,
  deleteTournamentService,
  updateTournamentService,
  publishTournamentService,
  openTournamentRegistrationService,
  closeTournamentRegistrationService,
  registerTournamentTeamService,
  joinTournamentWaitlistService,
  withdrawTournamentWaitlistEntryService,
  promoteNextTournamentWaitlistEntryService,
  promoteTournamentWaitlistEntryService,
  withdrawTournamentTeamService,
  approveTournamentTeamService,
  rejectTournamentTeamService,
  bulkReviewTournamentTeamsService,
  importTournamentTeamsService,
  generateTournamentBracketService,
  previewTournamentDrawService,
  autoScheduleTournamentMatchesService,
  sendTournamentMatchReminderService,
  checkInTournamentMatchTeamService,
  scheduleTournamentMatchService,
  recordTournamentMatchResultService,
  cancelTournamentService,
  completeTournamentService,
} from "./tournaments.service.js";

export async function listTournaments(req, res, next) {
  try {
    const result = await listTournamentsService(req.validatedQuery ?? req.query, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTournament(req, res, next) {
  try {
    const tournament = await getTournamentByIdService(req.params.tournamentId, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function getPublicTournament(req, res, next) {
  try {
    const tournament = await getPublicTournamentByIdService(req.params.tournamentId);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function createTournament(req, res, next) {
  try {
    const tournament = await createTournamentService(req.body, req.user);
    res.status(201).json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function deleteTournament(req, res, next) {
  try {
    const result = await deleteTournamentService(req.params.tournamentId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateTournament(req, res, next) {
  try {
    const tournament = await updateTournamentService(req.params.tournamentId, req.body, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function publishTournament(req, res, next) {
  try {
    const tournament = await publishTournamentService(req.params.tournamentId, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function openTournamentRegistration(req, res, next) {
  try {
    const tournament = await openTournamentRegistrationService(req.params.tournamentId, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function closeTournamentRegistration(req, res, next) {
  try {
    const tournament = await closeTournamentRegistrationService(req.params.tournamentId, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function cancelTournament(req, res, next) {
  try {
    const tournament = await cancelTournamentService(req.params.tournamentId, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function completeTournament(req, res, next) {
  try {
    const tournament = await completeTournamentService(req.params.tournamentId, req.user);
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function registerTournamentTeam(req, res, next) {
  try {
    const team = await registerTournamentTeamService(req.params.tournamentId, req.body, req.user);
    res.status(201).json({ team });
  } catch (error) {
    next(error);
  }
}

export async function joinTournamentWaitlist(req, res, next) {
  try {
    const entry = await joinTournamentWaitlistService(req.params.tournamentId, req.body, req.user);
    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
}

export async function withdrawTournamentWaitlistEntry(req, res, next) {
  try {
    const result = await withdrawTournamentWaitlistEntryService(req.params.tournamentId, req.params.entryId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function promoteTournamentWaitlistEntry(req, res, next) {
  try {
    const result = await promoteTournamentWaitlistEntryService(req.params.tournamentId, req.params.entryId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function promoteNextTournamentWaitlistEntry(req, res, next) {
  try {
    const result = await promoteNextTournamentWaitlistEntryService(req.params.tournamentId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function withdrawTournamentTeam(req, res, next) {
  try {
    const result = await withdrawTournamentTeamService(req.params.tournamentId, req.params.teamId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function approveTournamentTeam(req, res, next) {
  try {
    const team = await approveTournamentTeamService(req.params.tournamentId, req.params.teamId, req.body, req.user);
    res.json({ team });
  } catch (error) {
    next(error);
  }
}

export async function rejectTournamentTeam(req, res, next) {
  try {
    const team = await rejectTournamentTeamService(req.params.tournamentId, req.params.teamId, req.body, req.user);
    res.json({ team });
  } catch (error) {
    next(error);
  }
}

export async function bulkReviewTournamentTeams(req, res, next) {
  try {
    const teams = await bulkReviewTournamentTeamsService(req.params.tournamentId, req.body, req.user);
    res.json({ teams });
  } catch (error) {
    next(error);
  }
}

export async function importTournamentTeams(req, res, next) {
  try {
    const result = await importTournamentTeamsService(req.params.tournamentId, req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function generateTournamentBracket(req, res, next) {
  try {
    const tournament = await generateTournamentBracketService(req.params.tournamentId, req.user, req.body || {});
    res.json({ tournament });
  } catch (error) {
    next(error);
  }
}

export async function previewTournamentDraw(req, res, next) {
  try {
    const preview = await previewTournamentDrawService(req.params.tournamentId, req.user, req.query);
    res.json({ preview });
  } catch (error) {
    next(error);
  }
}

export async function autoScheduleTournamentMatches(req, res, next) {
  try {
    const result = await autoScheduleTournamentMatchesService(req.params.tournamentId, req.body || {}, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function scheduleTournamentMatch(req, res, next) {
  try {
    const match = await scheduleTournamentMatchService(req.params.tournamentId, req.params.matchId, req.body, req.user);
    res.json({ match });
  } catch (error) {
    next(error);
  }
}

export async function sendTournamentMatchReminder(req, res, next) {
  try {
    const result = await sendTournamentMatchReminderService(req.params.tournamentId, req.params.matchId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function checkInTournamentMatchTeam(req, res, next) {
  try {
    const match = await checkInTournamentMatchTeamService(req.params.tournamentId, req.params.matchId, req.body, req.user);
    res.json({ match });
  } catch (error) {
    next(error);
  }
}

export async function recordTournamentMatchResult(req, res, next) {
  try {
    const result = await recordTournamentMatchResultService(req.params.tournamentId, req.params.matchId, req.body, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
