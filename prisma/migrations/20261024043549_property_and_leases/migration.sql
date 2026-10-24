-- CreateEnum
CREATE TYPE "BuildingType" AS ENUM ('COMMERCIAL', 'RESIDENTIAL', 'INDUSTRIAL_COMPLEX', 'MIXED');

-- CreateEnum
CREATE TYPE "UnitStatusOverride" AS ENUM ('UNDER_RENOVATION', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "PrivacyAckMethod" AS ENUM ('SIGNED_FORM', 'EMAIL', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'RENEWED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AdvanceRentType" AS ENUM ('NONE', 'MONTHS', 'AMOUNT');

-- CreateEnum
CREATE TYPE "EscalationType" AS ENUM ('NONE', 'PERCENT', 'SCHEDULE');

-- CreateTable
CREATE TABLE "Building" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "type" "BuildingType" NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reminderConfig" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "UnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "unitTypeId" UUID NOT NULL,
    "floor" TEXT,
    "floorArea" DECIMAL(10,2),
    "isStandalone" BOOLEAN NOT NULL DEFAULT false,
    "statusOverride" "UnitStatusOverride",
    "reminderConfig" JSONB,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "type" "TenantType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "registeredName" TEXT,
    "tin" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "billingAddress" TEXT,
    "notes" TEXT,
    "privacyAckDate" DATE,
    "privacyAckMethod" "PrivacyAckMethod",
    "searchText" TEXT NOT NULL DEFAULT '',
    "anonymizedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" UUID NOT NULL,
    "refNo" TEXT NOT NULL,
    "unitId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "LeaseStatus" NOT NULL,
    "monthlyRent" DECIMAL(14,2) NOT NULL,
    "rentDueDay" INTEGER NOT NULL,
    "securityDeposit" DECIMAL(14,2) NOT NULL,
    "advanceRentType" "AdvanceRentType" NOT NULL DEFAULT 'NONE',
    "advanceRentMonths" INTEGER,
    "advanceRentAmount" DECIMAL(14,2),
    "escalationType" "EscalationType" NOT NULL DEFAULT 'NONE',
    "escalationPercent" DECIMAL(6,3),
    "escalationEveryMonths" INTEGER,
    "escalationSteps" JSONB,
    "remarks" TEXT,
    "previousLeaseId" UUID,
    "terminationDate" DATE,
    "terminationReason" TEXT,
    "terminatedAt" TIMESTAMPTZ(3),
    "terminatedById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,

    CONSTRAINT "LeaseCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "LeaseDraft" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeaseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitType_name_key" ON "UnitType"("name");

-- CreateIndex
CREATE INDEX "Unit_buildingId_idx" ON "Unit"("buildingId");

-- CreateIndex
CREATE INDEX "Unit_unitTypeId_idx" ON "Unit"("unitTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_refNo_key" ON "Lease"("refNo");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_previousLeaseId_key" ON "Lease"("previousLeaseId");

-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- CreateIndex
CREATE INDEX "Lease_tenantId_idx" ON "Lease"("tenantId");

-- CreateIndex
CREATE INDEX "Lease_status_idx" ON "Lease"("status");

-- CreateIndex
CREATE INDEX "Lease_endDate_idx" ON "Lease"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseDraft_userId_key" ON "LeaseDraft"("userId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_previousLeaseId_fkey" FOREIGN KEY ("previousLeaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Database-level guarantees (the services check these too, with friendly messages) ───

-- Unit numbers are unique within a building among non-archived units.
CREATE UNIQUE INDEX "Unit_building_unitNumber_active_key"
  ON "Unit" ("buildingId", lower("unitNumber")) WHERE "archivedAt" IS NULL;

-- Building codes and unit type names are compared without case.
CREATE UNIQUE INDEX "Building_code_ci_key" ON "Building" (lower("code"));
CREATE UNIQUE INDEX "UnitType_name_ci_key" ON "UnitType" (lower("name"));

-- No two non-archived leases on the same unit may cover the same day. The occupied period ends
-- on the termination date when a lease ended early.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_no_overlap" EXCLUDE USING gist (
  "unitId" WITH =,
  daterange("startDate", LEAST(COALESCE("terminationDate", "endDate"), "endDate"), '[]') WITH &&
) WHERE ("archivedAt" IS NULL);

ALTER TABLE "Lease"
  ADD CONSTRAINT "Lease_dates_check" CHECK ("endDate" > "startDate"),
  ADD CONSTRAINT "Lease_rentDueDay_check" CHECK ("rentDueDay" BETWEEN 1 AND 28),
  ADD CONSTRAINT "Lease_monthlyRent_check" CHECK ("monthlyRent" > 0),
  ADD CONSTRAINT "Lease_securityDeposit_check" CHECK ("securityDeposit" >= 0),
  ADD CONSTRAINT "Lease_termination_check" CHECK (
    "terminationDate" IS NULL OR ("terminationDate" >= "startDate" AND "terminationDate" <= "endDate")
  ),
  ADD CONSTRAINT "Lease_advance_check" CHECK (
    ("advanceRentType" = 'NONE' AND "advanceRentMonths" IS NULL AND "advanceRentAmount" IS NULL)
    OR ("advanceRentType" = 'MONTHS' AND "advanceRentMonths" > 0 AND "advanceRentAmount" IS NULL)
    OR ("advanceRentType" = 'AMOUNT' AND "advanceRentAmount" > 0 AND "advanceRentMonths" IS NULL)
  ),
  ADD CONSTRAINT "Lease_not_own_renewal_check" CHECK ("previousLeaseId" IS NULL OR "previousLeaseId" <> "id");

ALTER TABLE "Unit" ADD CONSTRAINT "Unit_floorArea_check" CHECK ("floorArea" IS NULL OR "floorArea" > 0);

-- Fast forgiving search on tenants.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Tenant_searchText_trgm_idx" ON "Tenant" USING gin ("searchText" gin_trgm_ops);
