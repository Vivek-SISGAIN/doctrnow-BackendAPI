-- CreateEnum
CREATE TYPE "StripeOnboardingStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'COMPLETE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "PayoutCadence" AS ENUM ('DAILY', 'WEEKLY', 'EVERY_3_DAYS', 'MANUAL');

-- CreateEnum
CREATE TYPE "CommissionInvoiceCycle" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "commission_invoice_cycle" "CommissionInvoiceCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "payout_cadence" "PayoutCadence",
ADD COLUMN     "stripe_account_id" TEXT,
ADD COLUMN     "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripe_onboarding_status" "StripeOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false;
