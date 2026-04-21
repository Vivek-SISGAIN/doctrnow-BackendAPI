/*
  Warnings:

  - You are about to drop the column `accreditationCertificates` on the `hospitals` table. All the data in the column will be lost.
  - You are about to drop the column `dhaLicenseDocument` on the `hospitals` table. All the data in the column will be lost.
  - You are about to drop the column `establishmentCard` on the `hospitals` table. All the data in the column will be lost.
  - You are about to drop the column `insuranceDocuments` on the `hospitals` table. All the data in the column will be lost.
  - You are about to drop the column `tradeLicenseDocument` on the `hospitals` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "hospitals" DROP COLUMN "accreditationCertificates",
DROP COLUMN "dhaLicenseDocument",
DROP COLUMN "establishmentCard",
DROP COLUMN "insuranceDocuments",
DROP COLUMN "tradeLicenseDocument",
ADD COLUMN     "accreditation_certificate_keys" TEXT[],
ADD COLUMN     "accreditation_certificates" TEXT[],
ADD COLUMN     "dha_license_document" TEXT,
ADD COLUMN     "dha_license_document_key" TEXT,
ADD COLUMN     "establishment_card" TEXT,
ADD COLUMN     "establishment_card_key" TEXT,
ADD COLUMN     "insurance_document_keys" TEXT[],
ADD COLUMN     "insurance_documents" TEXT[],
ADD COLUMN     "trade_license_document" TEXT,
ADD COLUMN     "trade_license_document_key" TEXT;
