-- Ops console phase 9: the Monday digest.
-- CreateTable
CREATE TABLE "DigestSnapshot" (
    "weekOf" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "DigestSnapshot_pkey" PRIMARY KEY ("weekOf")
);


ALTER TABLE "DigestSnapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "DigestSnapshot" FROM propfolio_tenant;
