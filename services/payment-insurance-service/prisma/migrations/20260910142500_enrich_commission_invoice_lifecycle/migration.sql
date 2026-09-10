-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_SUBMITTED';

-- AlterTable commission_invoices
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "invoice_number" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "hospital_name" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP(3);
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "payment_reference" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "payment_receipt_url" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "payment_notes" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "payment_submitted_at" TIMESTAMP(3);
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "payment_submitted_by" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "acknowledged_by" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3);
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "acknowledgment_notes" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "commission_invoices" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "commission_invoices_invoice_number_key" ON "commission_invoices"("invoice_number");
CREATE INDEX IF NOT EXISTS "commission_invoices_status_idx" ON "commission_invoices"("status");
CREATE INDEX IF NOT EXISTS "commission_invoices_invoice_number_idx" ON "commission_invoices"("invoice_number");
