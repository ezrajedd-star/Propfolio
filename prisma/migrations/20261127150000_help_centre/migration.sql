-- Ops console phase 6: help centre and the Support agent's ticket fields.
-- CreateEnum
CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "agentQueuedAt" TIMESTAMPTZ(3),
ADD COLUMN     "bugFollowedUpAt" TIMESTAMPTZ(3),
ADD COLUMN     "bugIssueNumber" INTEGER,
ADD COLUMN     "handedOverAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Getting started',
    "language" "TicketLanguage" NOT NULL DEFAULT 'EN',
    "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'staff',
    "publishedAt" TIMESTAMPTZ(3),
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE INDEX "HelpArticle_status_category_idx" ON "HelpArticle"("status", "category");

-- CreateIndex
CREATE INDEX "Ticket_agentQueuedAt_idx" ON "Ticket"("agentQueuedAt");


-- Managed in the console and read by the public help pages through the app's services.
ALTER TABLE "HelpArticle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "HelpArticle" FROM propfolio_tenant;
