const prisma = require('../src/prisma/prisma');

async function migrate() {
  const statements = [
    "ALTER TYPE \"PaymentStatus\" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS policy_snapshot JSONB",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason_code VARCHAR(100)",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_deduction DECIMAL(10,2)",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(10,2)",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50)"
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('Executed:', sql);
    } catch (err) {
      console.warn('Notice on:', sql, err.message);
    }
  }

  console.log('Appointment DB migration completed successfully');
  await prisma.$disconnect();
}

migrate().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
