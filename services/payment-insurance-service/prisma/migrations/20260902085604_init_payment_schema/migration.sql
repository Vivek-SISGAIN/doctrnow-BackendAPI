-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CONSULTATION_PAYMENT', 'NO_SHOW_PENALTY', 'LATE_CANCELLATION_PENALTY');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RefundReasonCategory" AS ENUM ('CANCELLATION_ON_TIME', 'CANCELLATION_LATE', 'DOCTOR_CANCELLED', 'DOCTOR_NO_SHOW', 'TECHNICAL_FAILURE', 'QUALITY_COMPLAINT', 'CHARGEBACK', 'ADMIN_MANUAL');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "doctor_id" TEXT,
    "type" "TransactionType" NOT NULL DEFAULT 'CONSULTATION_PAYMENT',
    "gross_amount" DECIMAL(10,2) NOT NULL,
    "commission_amount" DECIMAL(10,2) NOT NULL,
    "hospital_net_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'aed',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_connected_account_id" TEXT,
    "commission_invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonCategory" "RefundReasonCategory" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_refund_id" TEXT,
    "initiated_by" TEXT,
    "initiated_by_role" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "stripe_dispute_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "dispute_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'NEEDS_RESPONSE',
    "evidence_due_by" TIMESTAMP(3),
    "outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_invoices" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_commission" DECIMAL(10,2) NOT NULL,
    "vat_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_due" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "hospital_id" TEXT NOT NULL,
    "stripe_payout_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'aed',
    "arrival_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_payment_profiles" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "default_payment_method_id" TEXT,
    "card_saved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_payment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_stripe_payment_intent_id_key" ON "transactions"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "transactions_hospital_id_idx" ON "transactions"("hospital_id");

-- CreateIndex
CREATE INDEX "transactions_appointment_id_idx" ON "transactions"("appointment_id");

-- CreateIndex
CREATE INDEX "transactions_patient_id_idx" ON "transactions"("patient_id");

-- CreateIndex
CREATE INDEX "refunds_transaction_id_idx" ON "refunds"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_stripe_dispute_id_key" ON "disputes"("stripe_dispute_id");

-- CreateIndex
CREATE INDEX "disputes_transaction_id_idx" ON "disputes"("transaction_id");

-- CreateIndex
CREATE INDEX "commission_invoices_hospital_id_idx" ON "commission_invoices"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_stripe_payout_id_key" ON "payouts"("stripe_payout_id");

-- CreateIndex
CREATE INDEX "payouts_hospital_id_idx" ON "payouts"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_payment_profiles_patient_id_key" ON "patient_payment_profiles"("patient_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_commission_invoice_id_fkey" FOREIGN KEY ("commission_invoice_id") REFERENCES "commission_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
