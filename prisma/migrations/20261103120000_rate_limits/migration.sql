-- Rate limits for sign-in, two-step codes and password resets (keys are hashes).


-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");


-- Not reachable from customer work.
ALTER TABLE "RateLimit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RateLimit" FROM propfolio_tenant;
