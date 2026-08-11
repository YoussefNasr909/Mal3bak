-- Add tournament group-stage support without changing unrelated booking/payment fields.
ALTER TABLE "Tournament" ADD COLUMN "teamsPerGroup" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "TournamentTeam" ADD COLUMN "groupId" TEXT;
ALTER TABLE "TournamentMatch" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'knockout';
ALTER TABLE "TournamentMatch" ADD COLUMN "groupId" TEXT;
