-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'GRANDFATHER', 'GRANDMOTHER', 'GRANDSON', 'GRANDDAUGHTER', 'OTHER');

-- CreateEnum
CREATE TYPE "DoctorStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'PENDING', 'DEACTIVE');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('DHA', 'HAAD');

-- CreateEnum
CREATE TYPE "WorkingDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "profileImage" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "emiratesId" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "bloodGroup" "BloodGroup",
    "maritalStatus" "MaritalStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_member" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "emiratesId" TEXT,
    "nationality" TEXT NOT NULL,
    "mobileNumber" TEXT,
    "email" TEXT,
    "bloodGroup" "BloodGroup",
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DoctorStatus" NOT NULL DEFAULT 'PENDING',
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationality" TEXT NOT NULL,
    "emiratesId" TEXT NOT NULL,
    "primarySpecialization" TEXT NOT NULL,
    "subSpecialization" TEXT,
    "licenseNumber" TEXT NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "licenseExpiry" TIMESTAMP(3) NOT NULL,
    "yearsOfExperience" INTEGER NOT NULL,
    "medicalDegree" TEXT NOT NULL,
    "university" TEXT NOT NULL,
    "profileImage" TEXT NOT NULL,
    "languagesSpoken" TEXT[],
    "servicesOffered" TEXT[],
    "certifications" TEXT[],
    "professionalMemberships" TEXT[],
    "professionalBio" TEXT NOT NULL,
    "workingDays" "WorkingDay"[],
    "workingHoursFrom" TEXT NOT NULL,
    "workingHoursTo" TEXT NOT NULL,
    "consultationDuration" INTEGER NOT NULL,
    "videoConsultationFee" DECIMAL(10,2) NOT NULL,
    "phoneConsultationFee" DECIMAL(10,2) NOT NULL,
    "followUpFee" DECIMAL(10,2) NOT NULL,
    "hospitalSharePercent" INTEGER NOT NULL,
    "platformSharePercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_admin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationality" TEXT NOT NULL,
    "emiratesId" TEXT NOT NULL,
    "hospitalName" TEXT NOT NULL,
    "profileImage" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationality" TEXT NOT NULL,
    "emiratesId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileImage" TEXT NOT NULL,

    CONSTRAINT "super_admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_userId_key" ON "patient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_mobileNumber_key" ON "patient"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "patient_email_key" ON "patient"("email");

-- CreateIndex
CREATE UNIQUE INDEX "patient_emiratesId_key" ON "patient"("emiratesId");

-- CreateIndex
CREATE UNIQUE INDEX "family_member_emiratesId_key" ON "family_member"("emiratesId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_userId_key" ON "doctor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_email_key" ON "doctor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_licenseNumber_key" ON "doctor"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_admin_userId_key" ON "hospital_admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_admin_email_key" ON "hospital_admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_admin_phoneNumber_key" ON "hospital_admin"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_admin_emiratesId_key" ON "hospital_admin"("emiratesId");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_userId_key" ON "super_admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_email_key" ON "super_admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_phoneNumber_key" ON "super_admin"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_emiratesId_key" ON "super_admin"("emiratesId");
