-- Ops console phase 1b: incidents and heartbeats (system only).
-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('UPTIME', 'ERROR_TRACKER', 'HEALTH_CHECK', 'MANUAL');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('URGENT', 'NORMAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "source" "IncidentSource" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "externalId" TEXT,
    "link" TEXT,
    "details" JSONB,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,
    "resolvedNote" TEXT,
    "alertedAt" TIMESTAMPTZ(3),
    "alertTries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHeartbeat" (
    "name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Incident_status_startedAt_idx" ON "Incident"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_source_externalId_key" ON "Incident"("source", "externalId");


-- Never reachable from customer work.
ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Incident" FROM propfolio_tenant;
ALTER TABLE "SystemHeartbeat" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SystemHeartbeat" FROM propfolio_tenant;
