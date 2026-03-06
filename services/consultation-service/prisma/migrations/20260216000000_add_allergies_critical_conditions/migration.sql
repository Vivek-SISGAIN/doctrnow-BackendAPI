-- AlterTable: add allergies and criticalConditions to consultation_vitals (patient-reported in health details)
ALTER TABLE "consultation_vitals" ADD COLUMN IF NOT EXISTS "allergies" TEXT;
ALTER TABLE "consultation_vitals" ADD COLUMN IF NOT EXISTS "criticalConditions" TEXT;

