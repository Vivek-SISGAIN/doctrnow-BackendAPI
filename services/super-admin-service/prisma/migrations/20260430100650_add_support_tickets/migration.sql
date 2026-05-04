-- CreateEnum
CREATE TYPE "TICKET_STATUS" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TICKET_PRIORITY" AS ENUM ('High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "TICKET_CATEGORY" AS ENUM ('Booking_Issue', 'Payment_Problem', 'Technical_Issue', 'Doctor_Query', 'Other');

-- CreateEnum
CREATE TYPE "TICKET_ACTOR" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "ticket_code" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_role" TEXT NOT NULL,
    "category" "TICKET_CATEGORY" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TICKET_STATUS" NOT NULL DEFAULT 'open',
    "priority" "TICKET_PRIORITY" NOT NULL DEFAULT 'Medium',
    "assigned_to_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_timelines" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actor" "TICKET_ACTOR" NOT NULL DEFAULT 'USER',
    "user_id" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticket_code_key" ON "support_tickets"("ticket_code");

-- AddForeignKey
ALTER TABLE "ticket_timelines" ADD CONSTRAINT "ticket_timelines_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
