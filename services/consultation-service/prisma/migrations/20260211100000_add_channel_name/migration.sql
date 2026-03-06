<<<<<<< HEAD
-- AlterTable: store Agora channel name on consultation so patient and doctor join the same call (patient + doctor portals use this for Agora)
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "channelName" VARCHAR(255);
=======
-- AlterTable: store Agora channel name on consultation so patient and doctor join the same call (patient + doctor portals use this for Agora)
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "channelName" VARCHAR(255);
>>>>>>> 1d50fe0cf492a22266b8b9eefd64737b7c959561
