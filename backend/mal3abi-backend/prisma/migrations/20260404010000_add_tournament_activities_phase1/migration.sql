CREATE TABLE "TournamentActivity" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TournamentActivity_tournamentId_createdAt_idx" ON "TournamentActivity"("tournamentId", "createdAt");
CREATE INDEX "TournamentActivity_actorUserId_idx" ON "TournamentActivity"("actorUserId");

ALTER TABLE "TournamentActivity"
  ADD CONSTRAINT "TournamentActivity_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentActivity"
  ADD CONSTRAINT "TournamentActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
