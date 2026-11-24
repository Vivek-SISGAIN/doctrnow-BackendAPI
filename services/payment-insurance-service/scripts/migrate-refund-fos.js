const prisma = require('../src/config/prismaClient');

async function migrate() {
  const statements = [
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'REQUESTED'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'APPROVED'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'REJECTED'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'SUBMITTED_TO_PSP'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'PROCESSING'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'COMPLETED'",
    "ALTER TYPE \"RefundStatus\" ADD VALUE IF NOT EXISTS 'CANCELLED_REQUEST'",

    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PATIENT_CANCEL_FREE_WINDOW'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PATIENT_LATE_CANCEL'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PATIENT_NO_SHOW'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PROVIDER_CANCEL'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PROVIDER_NO_SHOW'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PLATFORM_TECH_FAILURE'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PROVIDER_TECH_FAILURE'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PATIENT_TECH_FAILURE'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'CONSULT_STARTED_PROVIDER_FAILURE'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'CONSULT_COMPLETED'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'DUPLICATE_CHARGE'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'INCORRECT_AMOUNT'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'ORPHAN_PAYMENT_BOOKING_FAILED'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'INSURANCE_COPAY_REVERSAL'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'PACKAGE_PROMO_CANCEL'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'CHARGEBACK_OPEN'",
    "ALTER TYPE \"RefundReasonCategory\" ADD VALUE IF NOT EXISTS 'REFUND_FAILED'",

    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS policy_snapshot JSONB",

    "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS decided_by VARCHAR(255)",
    "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS decision_reason TEXT",
    "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS policy_snapshot JSONB",
    "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS metadata JSONB"
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('Executed:', sql);
    } catch (err) {
      console.warn('Notice on:', sql, err.message);
    }
  }

  console.log('Migration completed successfully');
  await prisma.$disconnect();
}

migrate().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
