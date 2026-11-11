-- Free-resource requests and partner applications from the website (platform admin only).
-- CreateEnum
CREATE TYPE "WebsiteLeadKind" AS ENUM ('RESOURCE', 'PARTNER');

-- CreateTable
CREATE TABLE "WebsiteLead" (
    "id" UUID NOT NULL,
    "kind" "WebsiteLeadKind" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "partnerType" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "wantsUpdates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMPTZ(3),
    "handledById" UUID,

    CONSTRAINT "WebsiteLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteLead_kind_createdAt_idx" ON "WebsiteLead"("kind", "createdAt");

-- Never reachable from customer work.
ALTER TABLE "WebsiteLead" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WebsiteLead" FROM propfolio_tenant;
