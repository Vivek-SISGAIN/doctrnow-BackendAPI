<<<<<<< HEAD
-- Run this once if channelName is not saved on consultations (e.g. migration not applied).
-- PostgreSQL: psql -U your_user -d doctornow_consultations -f prisma/ensure-channel-name.sql
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "channelName" VARCHAR(255);
=======
-- Run this once if channelName is not saved on consultations (e.g. migration not applied).
-- PostgreSQL: psql -U your_user -d doctornow_consultations -f prisma/ensure-channel-name.sql
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "channelName" VARCHAR(255);
>>>>>>> 1d50fe0cf492a22266b8b9eefd64737b7c959561
