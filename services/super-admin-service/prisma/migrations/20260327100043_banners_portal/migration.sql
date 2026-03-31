/*
  Warnings:

  - Added the required column `portal` to the `Banners` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PORTAL" AS ENUM ('PATIENT', 'DOCTOR', 'GENERAL');

-- AlterTable
ALTER TABLE "Banners" ADD COLUMN     "portal" "PORTAL" NOT NULL;
