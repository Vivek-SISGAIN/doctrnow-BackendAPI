-- DropForeignKey
ALTER TABLE "finances" DROP CONSTRAINT "finances_hospitalId_fkey";

-- AddForeignKey
ALTER TABLE "finances" ADD CONSTRAINT "finances_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
