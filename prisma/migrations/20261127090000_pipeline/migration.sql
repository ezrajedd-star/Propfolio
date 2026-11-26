-- Ops console phase 3: the sales pipeline.
-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('LESSOR', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'BROKER', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('SIGNUP', 'DEMO_REQUEST', 'REFERRAL', 'MY_NETWORK', 'FACEBOOK', 'LINKEDIN', 'EVENT');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'TRIAL', 'ACTIVE_TRIAL', 'PAYING', 'LOST');

-- CreateEnum
CREATE TYPE "LeadActivityKind" AS ENUM ('CREATED', 'STAGE_CHANGED', 'NOTE', 'CALL', 'EMAIL', 'MESSAGE', 'MEETING', 'UPDATED', 'CONSENT', 'AUTOMATIC');

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "type" "LeadType" NOT NULL DEFAULT 'OTHER',
    "email" TEXT,
    "phone" TEXT,
    "source" "LeadSource" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "lostReason" TEXT,
    "lostAt" TIMESTAMPTZ(3),
    "stageChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" UUID,
    "portfolioSize" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "nextFollowUp" DATE,
    "ownerId" UUID,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMPTZ(3),
    "consentSource" TEXT,
    "unsubscribedAt" TIMESTAMPTZ(3),
    "brevoSyncedAt" TIMESTAMPTZ(3),
    "discovery" JSONB,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "kind" "LeadActivityKind" NOT NULL,
    "text" TEXT NOT NULL,
    "actorId" UUID,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_email_key" ON "Lead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_accountId_key" ON "Lead"("accountId");

-- CreateIndex
CREATE INDEX "Lead_stage_nextFollowUp_idx" ON "Lead"("stage", "nextFollowUp");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUp_idx" ON "Lead"("nextFollowUp");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Platform staff only; never reachable from customer work.
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Lead" FROM propfolio_tenant;
ALTER TABLE "LeadActivity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "LeadActivity" FROM propfolio_tenant;
