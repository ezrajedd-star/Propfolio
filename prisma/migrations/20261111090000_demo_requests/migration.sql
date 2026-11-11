-- "Book a demo" requests from the website (Propfolio's own records; platform admin only).
-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "units" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMPTZ(3),
    "handledById" UUID,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoRequest_createdAt_idx" ON "DemoRequest"("createdAt");

-- Never reachable from customer work.
ALTER TABLE "DemoRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DemoRequest" FROM propfolio_tenant;
