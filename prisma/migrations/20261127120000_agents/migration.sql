-- Ops console phase 5: AI agent foundations (system only).
-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('DRAFT', 'ACT_AND_TELL', 'ACT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FAILED', 'TOLD');

-- CreateTable
CREATE TABLE "AgentState" (
    "agentKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "firstEnabledAt" TIMESTAMPTZ(3),
    "stoppedReason" TEXT,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentState_pkey" PRIMARY KEY ("agentKey")
);

-- CreateTable
CREATE TABLE "AgentAutonomy" (
    "agentKey" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "level" "AutonomyLevel" NOT NULL DEFAULT 'DRAFT',
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentAutonomy_pkey" PRIMARY KEY ("agentKey","actionType")
);

-- CreateTable
CREATE TABLE "AgentActionLog" (
    "id" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT,
    "entityId" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUsage" (
    "agentKey" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "cacheReadTokens" BIGINT NOT NULL DEFAULT 0,
    "cacheWriteTokens" BIGINT NOT NULL DEFAULT 0,
    "sessionSeconds" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,

    CONSTRAINT "AgentUsage_pkey" PRIMARY KEY ("agentKey","month")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "externalId" TEXT,
    "purpose" TEXT NOT NULL,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "costUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "lockedBecause" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "decidedById" UUID,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "editedPreview" TEXT,
    "executedAt" TIMESTAMPTZ(3),
    "executionError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentActionLog_agentKey_createdAt_idx" ON "AgentActionLog"("agentKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_externalId_key" ON "AgentSession"("externalId");

-- CreateIndex
CREATE INDEX "AgentSession_createdAt_idx" ON "AgentSession"("createdAt");

-- CreateIndex
CREATE INDEX "Approval_status_createdAt_idx" ON "Approval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_agentKey_createdAt_idx" ON "Approval"("agentKey", "createdAt");


-- Never reachable from customer work.
ALTER TABLE "AgentState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AgentState" FROM propfolio_tenant;
ALTER TABLE "AgentAutonomy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AgentAutonomy" FROM propfolio_tenant;
ALTER TABLE "AgentActionLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AgentActionLog" FROM propfolio_tenant;
ALTER TABLE "AgentUsage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AgentUsage" FROM propfolio_tenant;
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AgentSession" FROM propfolio_tenant;
ALTER TABLE "Approval" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Approval" FROM propfolio_tenant;
