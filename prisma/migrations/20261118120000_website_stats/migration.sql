-- Website statistics: counts per day only (no IP addresses, no ids). Platform admin only.
-- CreateEnum
CREATE TYPE "WebsiteStatKind" AS ENUM ('VISIT', 'SIGNUP');

-- CreateTable
CREATE TABLE "WebsiteStat" (
    "day" DATE NOT NULL,
    "kind" "WebsiteStatKind" NOT NULL,
    "path" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebsiteStat_pkey" PRIMARY KEY ("day","kind","path","source")
);

-- Never reachable from customer work.
ALTER TABLE "WebsiteStat" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WebsiteStat" FROM propfolio_tenant;
