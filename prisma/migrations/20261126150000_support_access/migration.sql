-- Ops console phase 2: customer-granted support access.
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "supportAdminId" UUID,
ADD COLUMN     "supportAdminName" TEXT,
ADD COLUMN     "supportGrantId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSupportStaff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "grantedById" UUID NOT NULL,
    "grantedByName" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" UUID,

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAccessGrant_accountId_expiresAt_idx" ON "SupportAccessGrant"("accountId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_supportGrantId_idx" ON "Session"("supportGrantId");


-- Managed through the app's services only (system scope), never by customer queries directly.
ALTER TABLE "SupportAccessGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SupportAccessGrant" FROM propfolio_tenant;
