/*
  Warnings:

  - The values [CONSULTATION] on the enum `ServiceType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ServiceType_new" AS ENUM ('LAB_TEST', 'IMAGING', 'HOME_CARE', 'DIAGNOSTICS');
ALTER TABLE "HealthService" ALTER COLUMN "type" TYPE "ServiceType_new" USING ("type"::text::"ServiceType_new");
ALTER TYPE "ServiceType" RENAME TO "ServiceType_old";
ALTER TYPE "ServiceType_new" RENAME TO "ServiceType";
DROP TYPE "public"."ServiceType_old";
COMMIT;
