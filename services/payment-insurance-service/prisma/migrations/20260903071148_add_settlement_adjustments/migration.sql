-- CreateEnum
CREATE TYPE "SettlementAdjustmentStatus" AS ENUM ('OPEN', 'APPLIED', 'RECOVERED_VIA_REVERSAL');

-- CreateTable
CREATE TABLE "settlement_adjustments" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SettlementAdjustmentStatus" NOT NULL DEFAULT 'OPEN',
    "stripe_transfer_reversal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_adjustments_hospital_id_idx" ON "settlement_adjustments"("hospital_id");
