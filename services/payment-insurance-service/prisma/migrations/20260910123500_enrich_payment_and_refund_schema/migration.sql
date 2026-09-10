-- AlterTable transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payment_method_type" TEXT DEFAULT 'card';
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "card_brand" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "card_last4" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "receipt_url" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "customer_email" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "doctor_name" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "doctor_specialty" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "hospital_name" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "patient_name" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "patient_email" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "consultation_type" TEXT;

-- CreateIndex on transactions
CREATE INDEX IF NOT EXISTS "transactions_doctor_id_idx" ON "transactions"("doctor_id");
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions"("status");
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions"("created_at");
CREATE INDEX IF NOT EXISTS "transactions_paid_at_idx" ON "transactions"("paid_at");

-- AlterTable refunds
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "receipt_url" TEXT;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;

-- CreateIndex on refunds
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("status");
CREATE INDEX IF NOT EXISTS "refunds_created_at_idx" ON "refunds"("created_at");
