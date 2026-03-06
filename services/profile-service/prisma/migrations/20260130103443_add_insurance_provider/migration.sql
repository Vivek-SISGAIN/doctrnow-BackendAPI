-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('INSURANCE_COMPANY', 'TPA');

-- CreateEnum
CREATE TYPE "NetworkType" AS ENUM ('IN_NETWORK', 'OUT_NETWORK', 'BOTH');

-- CreateEnum
CREATE TYPE "ClaimSubmissionMethod" AS ENUM ('ONLINE_PORTAL', 'EMAIL', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "SupportedService" AS ENUM ('CONSULTATION', 'LAB_TESTS', 'PACKAGES', 'DIAGNOSTICS', 'HOME_CARE', 'SURGERY', 'EMERGENCY');

-- CreateTable
CREATE TABLE "insurance_provider" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "website" TEXT,
    "networkType" "NetworkType" NOT NULL,
    "claimSubmissionMethod" "ClaimSubmissionMethod" NOT NULL,
    "avgProcessingDays" INTEGER,
    "address" TEXT NOT NULL,
    "supportedServices" "SupportedService"[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_provider_pkey" PRIMARY KEY ("id")
);
