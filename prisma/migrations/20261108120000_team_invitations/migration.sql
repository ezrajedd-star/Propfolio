-- Teams (public launch, Phase 6): invitations by email, 7 days, used once.
-- Reversible: prisma/rollback/20261108120000_team_invitations.down.sql

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_accountId_email_idx" ON "Invitation"("accountId", "email");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Propfolio's own record (links are sign-in material): never reachable from customer work.
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Invitation" FROM propfolio_tenant;
