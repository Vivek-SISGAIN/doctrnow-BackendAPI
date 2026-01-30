/*
  Warnings:

  - The values [DEACTIVE] on the enum `DoctorStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DoctorStatus_new" AS ENUM ('ACTIVE', 'ON_LEAVE', 'PENDING', 'INACTIVE');
ALTER TABLE "public"."doctor" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "doctor" ALTER COLUMN "status" TYPE "DoctorStatus_new" USING ("status"::text::"DoctorStatus_new");
ALTER TYPE "DoctorStatus" RENAME TO "DoctorStatus_old";
ALTER TYPE "DoctorStatus_new" RENAME TO "DoctorStatus";
DROP TYPE "public"."DoctorStatus_old";
ALTER TABLE "doctor" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
