-- Add persistent admin-controlled display ordering for courts.
ALTER TABLE "Court" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve the previously visible default list order for existing courts:
-- newest courts first, then deterministic UUID order. New courts will append after this order.
WITH ordered_courts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, "id" ASC) AS rn
  FROM "Court"
  WHERE "status" <> 'deleted'
)
UPDATE "Court" c
SET "displayOrder" = ordered_courts.rn
FROM ordered_courts
WHERE c."id" = ordered_courts."id";

CREATE INDEX "Court_displayOrder_createdAt_idx" ON "Court"("displayOrder", "createdAt");
