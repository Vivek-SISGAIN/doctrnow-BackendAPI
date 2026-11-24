import prisma from '../src/prisma/client.js';

async function migrate() {
  const statements = [
    "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours INTEGER DEFAULT 4",
    "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS late_cancellation_fee_percent INTEGER DEFAULT 50",
    "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS near_time_no_show_hours INTEGER DEFAULT 1",
    "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS patient_grace_minutes INTEGER DEFAULT 10",
    "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS doctor_grace_minutes INTEGER DEFAULT 10",
    "ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS refund_policy_version VARCHAR(50) DEFAULT '1.0.0-DEFAULT'"
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('Executed:', sql);
    } catch (err) {
      console.warn('Notice on:', sql, err.message);
    }
  }

  console.log('Super-admin DB migration completed successfully');
  await prisma.$disconnect();
}

migrate().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
