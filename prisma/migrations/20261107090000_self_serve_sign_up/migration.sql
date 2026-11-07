-- Self-serve sign-up (public launch, Phase 4): pending sign-ups, Google sign-in, versioned legal
-- acceptances, the sign-up funnel, and "keep me signed in" sessions.
-- Reversible: prisma/rollback/20261107090000_self_serve_sign_up.down.sql

-- CreateEnum
CREATE TYPE "LegalDocument" AS ENUM ('TERMS', 'PRIVACY', 'DPA');

-- CreateEnum
CREATE TYPE "FunnelStep" AS ENUM ('SIGNUP_STARTED', 'EMAIL_VERIFIED', 'FIRST_UNIT', 'FIRST_LEASE');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "persistent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleSub" TEXT;

-- AlterTable
ALTER TABLE "SignInChallenge" ADD COLUMN     "persistent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PendingSignUp" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "codesSent" INTEGER NOT NULL DEFAULT 1,
    "codeSentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSignUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "document" "LegalDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" UUID NOT NULL,
    "step" "FunnelStep" NOT NULL,
    "accountId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignUp_tokenHash_key" ON "PendingSignUp"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingSignUp_email_idx" ON "PendingSignUp"("email");

-- CreateIndex
CREATE INDEX "PendingSignUp_expiresAt_idx" ON "PendingSignUp"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalAcceptance_userId_document_version_key" ON "LegalAcceptance"("userId", "document", "version");

-- CreateIndex
CREATE INDEX "FunnelEvent_step_createdAt_idx" ON "FunnelEvent"("step", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FunnelEvent_accountId_step_key" ON "FunnelEvent"("accountId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Propfolio's own records: never reachable from customer work.
ALTER TABLE "PendingSignUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegalAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FunnelEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PendingSignUp", "LegalAcceptance", "FunnelEvent" FROM propfolio_tenant;
