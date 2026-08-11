-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('draft', 'published', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "TournamentFormat" AS ENUM ('single_elimination');
CREATE TYPE "TournamentTeamStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
CREATE TYPE "TournamentMatchStatus" AS ENUM ('pending', 'scheduled', 'completed', 'cancelled');

CREATE TABLE "Tournament" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleAr" TEXT,
  "description" TEXT,
  "descriptionAr" TEXT,
  "managerId" TEXT NOT NULL,
  "status" "TournamentStatus" NOT NULL DEFAULT 'draft',
  "format" "TournamentFormat" NOT NULL DEFAULT 'single_elimination',
  "teamSize" INTEGER NOT NULL DEFAULT 2,
  "maxTeams" INTEGER NOT NULL,
  "entryFee" DECIMAL(10,2),
  "registrationOpenAt" TIMESTAMP(3),
  "registrationCloseAt" TIMESTAMP(3),
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "rules" TEXT,
  "coverImage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentCourt" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "courtId" TEXT NOT NULL,
  CONSTRAINT "TournamentCourt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentTeam" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "captainUserId" TEXT NOT NULL,
  "partnerName" TEXT,
  "partnerPhone" TEXT,
  "status" "TournamentTeamStatus" NOT NULL DEFAULT 'pending',
  "seed" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentMatch" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "matchNumber" INTEGER NOT NULL,
  "teamAId" TEXT,
  "teamBId" TEXT,
  "winnerTeamId" TEXT,
  "courtId" TEXT,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "status" "TournamentMatchStatus" NOT NULL DEFAULT 'pending',
  "scoreJson" JSONB,
  "closureId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tournament_managerId_idx" ON "Tournament"("managerId");
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE UNIQUE INDEX "TournamentCourt_tournamentId_courtId_key" ON "TournamentCourt"("tournamentId", "courtId");
CREATE INDEX "TournamentCourt_courtId_idx" ON "TournamentCourt"("courtId");
CREATE INDEX "TournamentTeam_tournamentId_idx" ON "TournamentTeam"("tournamentId");
CREATE INDEX "TournamentTeam_captainUserId_idx" ON "TournamentTeam"("captainUserId");
CREATE UNIQUE INDEX "TournamentTeam_tournamentId_captainUserId_key" ON "TournamentTeam"("tournamentId", "captainUserId");
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_roundNumber_matchNumber_key" ON "TournamentMatch"("tournamentId", "roundNumber", "matchNumber");
CREATE UNIQUE INDEX "TournamentMatch_closureId_key" ON "TournamentMatch"("closureId");
CREATE INDEX "TournamentMatch_courtId_idx" ON "TournamentMatch"("courtId");
CREATE INDEX "TournamentMatch_status_idx" ON "TournamentMatch"("status");

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentCourt" ADD CONSTRAINT "TournamentCourt_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentCourt" ADD CONSTRAINT "TournamentCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_captainUserId_fkey" FOREIGN KEY ("captainUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "TournamentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "TournamentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "TournamentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "CourtClosure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
