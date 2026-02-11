-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('ONLINE', 'OFFLINE', 'BUSY');

-- AlterTable
ALTER TABLE "doctor" ADD COLUMN "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'OFFLINE';
