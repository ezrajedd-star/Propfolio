-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('EXPIRY', 'REPEAT');

-- CreateEnum
CREATE TYPE "ReminderEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('SENDING', 'SENT', 'FAILED', 'EMPTY');

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "reminderHandledAt" TIMESTAMPTZ(3),
ADD COLUMN     "reminderHandledById" UUID,
ADD COLUMN     "reminderHandledNote" TEXT;

-- CreateTable
CREATE TABLE "ReminderEvent" (
    "id" UUID NOT NULL,
    "leaseId" UUID NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "status" "ReminderEventStatus" NOT NULL DEFAULT 'PENDING',
    "digestId" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "skippedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReminderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDigest" (
    "id" UUID NOT NULL,
    "digestDate" DATE NOT NULL,
    "status" "DigestStatus" NOT NULL,
    "recipientIds" UUID[],
    "leaseCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReminderDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderEvent_status_scheduledDate_idx" ON "ReminderEvent"("status", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderEvent_leaseId_scheduledDate_key" ON "ReminderEvent"("leaseId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDigest_digestDate_key" ON "ReminderDigest"("digestDate");

-- AddForeignKey
ALTER TABLE "ReminderEvent" ADD CONSTRAINT "ReminderEvent_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderEvent" ADD CONSTRAINT "ReminderEvent_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "ReminderDigest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
