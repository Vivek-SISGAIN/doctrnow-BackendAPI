-- CreateEnum
CREATE TYPE "LabReportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SENT');

-- CreateEnum
CREATE TYPE "LabReportPriority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');

-- CreateTable
CREATE TABLE "lab_reports" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "consultationId" TEXT,
    "reportId" TEXT NOT NULL,
    "consultationDate" TIMESTAMP(3),
    "consultationTime" TEXT,
    "orderedTests" TEXT[],
    "status" "LabReportStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "LabReportPriority" NOT NULL DEFAULT 'ROUTINE',
    "resultDate" TIMESTAMP(3),
    "notes" TEXT,
    "results" JSONB,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewComments" TEXT,
    "sentToPatient" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_reports_reportId_key" ON "lab_reports"("reportId");

-- CreateIndex
CREATE INDEX "lab_reports_patientId_idx" ON "lab_reports"("patientId");

-- CreateIndex
CREATE INDEX "lab_reports_doctorId_idx" ON "lab_reports"("doctorId");

-- CreateIndex
CREATE INDEX "lab_reports_status_idx" ON "lab_reports"("status");

-- CreateIndex
CREATE INDEX "lab_reports_createdAt_idx" ON "lab_reports"("createdAt");
