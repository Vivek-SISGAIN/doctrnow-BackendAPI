ALTER TABLE "consultations"
ADD COLUMN "hospitalId" TEXT;

CREATE INDEX "consultations_hospitalId_idx" ON "consultations"("hospitalId");
