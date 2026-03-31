-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "STATE" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "hospitals" (
    "id" TEXT NOT NULL,
    "official_name" TEXT NOT NULL,
    "short_name" TEXT,
    "registration_number" TEXT NOT NULL,
    "dha_license_number" TEXT NOT NULL,
    "hospital_type" TEXT NOT NULL,
    "specialization_focus" TEXT,
    "branch_id" TEXT,
    "emirate" TEXT NOT NULL,
    "area" TEXT,
    "fullAddress" TEXT NOT NULL,
    "poBox" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "state" "STATE" DEFAULT 'PENDING',
    "landline" TEXT,
    "mobile" TEXT NOT NULL,
    "officialEmail" TEXT NOT NULL,
    "website" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "operations" TEXT,
    "servicesOffered" TEXT[],
    "specializationsAvailable" TEXT[],
    "tradeLicenseDocument" TEXT,
    "dhaLicenseDocument" TEXT,
    "insuranceDocuments" TEXT[],
    "establishmentCard" TEXT,
    "accreditationCertificates" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finances" (
    "id" TEXT NOT NULL,
    "platform_commission" DOUBLE PRECISION NOT NULL,
    "hospital_share" DOUBLE PRECISION NOT NULL,
    "doctor_share" DOUBLE PRECISION NOT NULL,
    "payout_frequency" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "min_payout_threshold" DOUBLE PRECISION NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "swift_code" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "branch_address" TEXT,
    "hospitalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banners" (
    "id" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "serviceDesc" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_registration_number_key" ON "hospitals"("registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_dha_license_number_key" ON "hospitals"("dha_license_number");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_officialEmail_key" ON "hospitals"("officialEmail");

-- CreateIndex
CREATE UNIQUE INDEX "finances_hospitalId_key" ON "finances"("hospitalId");

-- AddForeignKey
ALTER TABLE "finances" ADD CONSTRAINT "finances_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

