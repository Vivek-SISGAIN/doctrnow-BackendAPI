<<<<<<< HEAD
-- AlterTable: add allergies and criticalConditions to consultation_vitals (patient-reported in health details)
ALTER TABLE "consultation_vitals" ADD COLUMN IF NOT EXISTS "allergies" TEXT;
ALTER TABLE "consultation_vitals" ADD COLUMN IF NOT EXISTS "criticalConditions" TEXT;
=======
-- AlterTable: add allergies and criticalConditions to consultation_vitals (patient-reported in health details)
ALTER TABLE "consultation_vitals" ADD COLUMN IF NOT EXISTS "allergies" TEXT;
ALTER TABLE "consultation_vitals" ADD COLUMN IF NOT EXISTS "criticalConditions" TEXT;
>>>>>>> 1d50fe0cf492a22266b8b9eefd64737b7c959561
