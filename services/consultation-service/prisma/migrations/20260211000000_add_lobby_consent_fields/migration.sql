-- AlterTable
ALTER TABLE "consultations" ADD COLUMN "patientJoinedAt" TIMESTAMP(3);
ALTER TABLE "consultations" ADD COLUMN "consentRequestedAt" TIMESTAMP(3);
ALTER TABLE "consultations" ADD COLUMN "consentAcceptedAt" TIMESTAMP(3);
