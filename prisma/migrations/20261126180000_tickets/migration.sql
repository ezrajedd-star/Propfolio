-- Ops console phase 4: support tickets.
-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'WAITING_ON_CUSTOMER', 'WAITING_ON_US', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('HOW_TO', 'BUG', 'BILLING', 'PRIVACY', 'FEATURE', 'COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketLanguage" AS ENUM ('EN', 'TL', 'CEB');

-- CreateEnum
CREATE TYPE "TicketAuthor" AS ENUM ('CUSTOMER', 'STAFF', 'AGENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "language" "TicketLanguage" NOT NULL DEFAULT 'EN',
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "pagePath" TEXT,
    "assignedToId" UUID,
    "lastCustomerMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReplyAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "author" "TicketAuthor" NOT NULL,
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "emailedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_number_key" ON "Ticket"("number");

-- CreateIndex
CREATE INDEX "Ticket_status_createdAt_idx" ON "Ticket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_accountId_createdAt_idx" ON "Ticket"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_userId_createdAt_idx" ON "Ticket"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_attachmentKey_key" ON "TicketMessage"("attachmentKey");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ticket numbers start at T-1001.
ALTER SEQUENCE "Ticket_number_seq" RESTART WITH 1001;

-- Reached only through the app's services (system scope).
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Ticket" FROM propfolio_tenant;
ALTER TABLE "TicketMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TicketMessage" FROM propfolio_tenant;
