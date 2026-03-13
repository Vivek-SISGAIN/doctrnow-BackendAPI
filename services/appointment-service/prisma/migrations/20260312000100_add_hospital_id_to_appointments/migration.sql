ALTER TABLE "appointments"
ADD COLUMN "hospitalId" TEXT;

UPDATE "appointments"
SET "hospitalId" = 'unknown'
WHERE "hospitalId" IS NULL;

ALTER TABLE "appointments"
ALTER COLUMN "hospitalId" SET NOT NULL;

CREATE INDEX "appointments_hospitalId_idx" ON "appointments"("hospitalId");
