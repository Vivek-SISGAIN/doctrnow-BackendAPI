-- AlterTable: add missing consultation fields
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "patientAuthId" TEXT;
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "doctorAuthId" TEXT;
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN DEFAULT false;
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- Ensure isAnonymous is set for existing rows and made NOT NULL
UPDATE "consultations" SET "isAnonymous" = false WHERE "isAnonymous" IS NULL;
ALTER TABLE "consultations" ALTER COLUMN "isAnonymous" SET NOT NULL;
