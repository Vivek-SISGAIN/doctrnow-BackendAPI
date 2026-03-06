-- AlterTable: store Agora channel name on consultation so patient and doctor join the same call (patient + doctor portals use this for Agora)
ALTER TABLE "consultations" ADD COLUMN IF NOT EXISTS "channelName" VARCHAR(255);
