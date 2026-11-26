-- CreateEnum
CREATE TYPE "OpsRequestKind" AS ENUM ('RESTART_WEB', 'RESTART_WORKER');

-- CreateEnum
CREATE TYPE "OpsRequestStatus" AS ENUM ('WAITING', 'DONE', 'FAILED');



-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "diagnostics" JSONB,
ADD COLUMN     "githubIssueNumber" INTEGER,
ADD COLUMN     "publicNote" TEXT,
ADD COLUMN     "publicNoteAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "OpsRequest" (
    "id" UUID NOT NULL,
    "kind" "OpsRequestKind" NOT NULL,
    "status" "OpsRequestStatus" NOT NULL DEFAULT 'WAITING',
    "requestedById" UUID,
    "requestedByName" TEXT,
    "reason" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMPTZ(3),

    CONSTRAINT "OpsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreCheck" (
    "id" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "backupFile" TEXT NOT NULL,
    "backupTakenAt" TIMESTAMPTZ(3),
    "tableCounts" JSONB NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "problem" TEXT,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RestoreCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsRequest_status_createdAt_idx" ON "OpsRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RestoreCheck_checkedAt_idx" ON "RestoreCheck"("checkedAt");


ALTER TABLE "OpsRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "OpsRequest" FROM propfolio_tenant;
ALTER TABLE "RestoreCheck" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RestoreCheck" FROM propfolio_tenant;
