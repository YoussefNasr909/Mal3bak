-- CreateEnum
CREATE TYPE "TournamentWaitlistStatus" AS ENUM ('waiting', 'promoted', 'withdrawn', 'removed');

-- CreateTable
CREATE TABLE "TournamentWaitlistEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "captainUserId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "partnerName" TEXT,
    "partnerPhone" TEXT,
    "status" "TournamentWaitlistStatus" NOT NULL DEFAULT 'waiting',
    "notes" TEXT,
    "promotedTeamId" TEXT,
    "promotedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentWaitlistEntry_tournamentId_captainUserId_key" ON "TournamentWaitlistEntry"("tournamentId", "captainUserId");

-- CreateIndex
CREATE INDEX "TournamentWaitlistEntry_tournamentId_status_createdAt_idx" ON "TournamentWaitlistEntry"("tournamentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentWaitlistEntry_captainUserId_idx" ON "TournamentWaitlistEntry"("captainUserId");

-- CreateIndex
CREATE INDEX "TournamentWaitlistEntry_promotedTeamId_idx" ON "TournamentWaitlistEntry"("promotedTeamId");

-- AddForeignKey
ALTER TABLE "TournamentWaitlistEntry" ADD CONSTRAINT "TournamentWaitlistEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentWaitlistEntry" ADD CONSTRAINT "TournamentWaitlistEntry_captainUserId_fkey" FOREIGN KEY ("captainUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentWaitlistEntry" ADD CONSTRAINT "TournamentWaitlistEntry_promotedTeamId_fkey" FOREIGN KEY ("promotedTeamId") REFERENCES "TournamentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
