-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('NOT_TRANSFERRED', 'TRANSFERRED', 'FAILED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "stripe_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stripe_transfer_id" TEXT,
ADD COLUMN     "transfer_status" "TransferStatus" NOT NULL DEFAULT 'NOT_TRANSFERRED',
ADD COLUMN     "transferred_at" TIMESTAMP(3),
ALTER COLUMN "hospital_net_amount" SET DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_stripe_transfer_id_key" ON "transactions"("stripe_transfer_id");
