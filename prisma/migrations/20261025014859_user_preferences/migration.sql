-- DropIndex
DROP INDEX "Tenant_searchText_trgm_idx";

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId","key")
);
