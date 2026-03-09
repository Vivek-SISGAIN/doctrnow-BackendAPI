/*
  Warnings:

  - You are about to drop the column `workingDays` on the `doctor` table. All the data in the column will be lost.
  - You are about to drop the column `workingHoursFrom` on the `doctor` table. All the data in the column will be lost.
  - You are about to drop the column `workingHoursTo` on the `doctor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[emiratesId]` on the table `doctor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `schedule` to the `doctor` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "doctor" DROP COLUMN "workingDays",
DROP COLUMN "workingHoursFrom",
DROP COLUMN "workingHoursTo",
ADD COLUMN     "schedule" JSONB NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "doctor_emiratesId_key" ON "doctor"("emiratesId");
