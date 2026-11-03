-- Separate customer accounts (public launch, Phase 1).
--
-- Every business record now belongs to exactly one Account. Two locks keep accounts apart:
--  1. The app adds "this account only" to every query (src/server/db.ts).
--  2. Row-level security: the app runs each transaction as the restricted role
--     "propfolio_tenant" with the account id in the setting "app.account_id"; Postgres then
--     only shows and accepts that account's rows. With no account set, nothing is visible.
--
-- Existing data (the single company so far) moves into Account #1. To undo this migration, see
-- prisma/rollback/20261102120000_accounts.down.sql.

-- ─── The account the current transaction works for ─────────────────────────────────────────

CREATE FUNCTION current_account_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.account_id', true), '')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'propfolio_tenant') THEN
    CREATE ROLE propfolio_tenant NOLOGIN;
  END IF;
END
$$;
-- The app's database user switches to this role for customer work (SET LOCAL ROLE).
GRANT propfolio_tenant TO CURRENT_USER;

-- ─── New types and tables ──────────────────────────────────────────────────────────────────

CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'PREMIUM');

CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "Plan" NOT NULL DEFAULT 'PREMIUM',
    "trialEndsAt" TIMESTAMPTZ(3),
    "paidUntil" DATE,
    "suspendedAt" TIMESTAMPTZ(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL DEFAULT current_account_id(),
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualPayment" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidUntil" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ManualPayment_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "PlatformAdmin" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "totpSecretEnc" TEXT,
    "totpConfirmedAt" TIMESTAMPTZ(3),
    "totpLastStep" BIGINT,
    "setupTokenHash" TEXT,
    "setupTokenExpiresAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "adminId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

-- ─── Account #1: the company that used Propfolio so far ────────────────────────────────────
-- Only created when there is existing data (a fresh database starts with no accounts).

CREATE TEMP TABLE _account1 AS
SELECT '00000000-0000-7000-8000-000000000001'::uuid AS id
WHERE EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Building")
   OR EXISTS (SELECT 1 FROM "Tenant") OR EXISTS (SELECT 1 FROM "AuditLog");

INSERT INTO "Account" ("id", "name", "status", "plan", "updatedAt")
SELECT a.id,
       COALESCE((SELECT "value" #>> '{}' FROM "Setting" WHERE "key" = 'companyName'), 'Account 1'),
       'ACTIVE', 'PREMIUM', CURRENT_TIMESTAMP
FROM _account1 a;

-- Everyone's role moves to their membership of Account #1. The longest-standing active Admin
-- becomes the Owner.
INSERT INTO "Membership" ("id", "accountId", "userId", "role", "isActive", "createdAt", "updatedAt", "createdById")
SELECT u."id", a.id, u."id", u."role", u."isActive", u."createdAt", CURRENT_TIMESTAMP, u."createdById"
FROM "User" u CROSS JOIN _account1 a;

UPDATE "Membership" SET "role" = 'OWNER'
WHERE "id" = (
  SELECT m."id" FROM "Membership" m
  WHERE m."role" = 'ADMIN' AND m."isActive"
  ORDER BY m."createdAt", m."id" LIMIT 1
);

-- Sessions are tied to an account from now on: everyone signs in again.
DELETE FROM "Session";

-- ─── Add the account to every business table ───────────────────────────────────────────────

ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete;

DO $$
DECLARE
  t text;
  acc uuid := (SELECT id FROM _account1);
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AuditLog', 'Setting', 'Building', 'UnitType', 'Unit', 'Tenant', 'Lease', 'LeaseCounter',
    'LeaseDraft', 'UserPreference', 'ReminderEvent', 'ReminderDigest', 'Charge', 'Payment',
    'PaymentAllocation', 'PaymentCounter', 'Document', 'Feedback'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "accountId" UUID', t);
    IF acc IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET "accountId" = $1', t) USING acc;
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "accountId" SET DEFAULT current_account_id()', t);
    IF t <> 'AuditLog' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN "accountId" SET NOT NULL', t);
    END IF;
  END LOOP;
END
$$;

ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update_delete;

ALTER TABLE "Session" ADD COLUMN "accountId" UUID NOT NULL;

DROP TABLE _account1;

ALTER TABLE "User" DROP COLUMN "isActive", DROP COLUMN "role";
DROP INDEX IF EXISTS "User_role_isActive_idx";

-- ─── Keys and indexes: unique within an account ────────────────────────────────────────────

DROP INDEX "Building_code_key";
DROP INDEX "Building_code_ci_key";
CREATE UNIQUE INDEX "Building_accountId_code_key" ON "Building"("accountId", "code");
CREATE UNIQUE INDEX "Building_accountId_code_ci_key" ON "Building" ("accountId", lower("code"));

DROP INDEX "UnitType_name_key";
DROP INDEX "UnitType_name_ci_key";
CREATE UNIQUE INDEX "UnitType_accountId_name_key" ON "UnitType"("accountId", "name");
CREATE UNIQUE INDEX "UnitType_accountId_name_ci_key" ON "UnitType" ("accountId", lower("name"));

DROP INDEX "Lease_refNo_key";
CREATE UNIQUE INDEX "Lease_accountId_refNo_key" ON "Lease"("accountId", "refNo");
DROP INDEX "Lease_status_idx";
CREATE INDEX "Lease_accountId_status_idx" ON "Lease"("accountId", "status");

DROP INDEX "Payment_paymentNo_key";
CREATE UNIQUE INDEX "Payment_accountId_paymentNo_key" ON "Payment"("accountId", "paymentNo");
DROP INDEX "Payment_receivedDate_idx";
CREATE INDEX "Payment_accountId_receivedDate_idx" ON "Payment"("accountId", "receivedDate");

DROP INDEX "LeaseDraft_userId_key";
CREATE UNIQUE INDEX "LeaseDraft_accountId_userId_key" ON "LeaseDraft"("accountId", "userId");

DROP INDEX "ReminderDigest_digestDate_key";
CREATE UNIQUE INDEX "ReminderDigest_accountId_digestDate_key" ON "ReminderDigest"("accountId", "digestDate");
DROP INDEX "ReminderEvent_status_scheduledDate_idx";
CREATE INDEX "ReminderEvent_accountId_status_scheduledDate_idx" ON "ReminderEvent"("accountId", "status", "scheduledDate");

DROP INDEX "Charge_dueDate_idx";
CREATE INDEX "Charge_accountId_dueDate_idx" ON "Charge"("accountId", "dueDate");

DROP INDEX "Feedback_status_createdAt_idx";
CREATE INDEX "Feedback_accountId_status_createdAt_idx" ON "Feedback"("accountId", "status", "createdAt");

ALTER TABLE "LeaseCounter" DROP CONSTRAINT "LeaseCounter_pkey",
  ADD CONSTRAINT "LeaseCounter_pkey" PRIMARY KEY ("accountId", "year");
ALTER TABLE "PaymentCounter" DROP CONSTRAINT "PaymentCounter_pkey",
  ADD CONSTRAINT "PaymentCounter_pkey" PRIMARY KEY ("accountId", "year");
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey",
  ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("accountId", "key");
ALTER TABLE "UserPreference" DROP CONSTRAINT "UserPreference_pkey",
  ADD CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("accountId", "userId", "key");

CREATE INDEX "AuditLog_accountId_at_idx" ON "AuditLog"("accountId", "at");
CREATE INDEX "Document_accountId_idx" ON "Document"("accountId");
CREATE INDEX "Tenant_accountId_idx" ON "Tenant"("accountId");
CREATE INDEX "Unit_accountId_idx" ON "Unit"("accountId");

CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_accountId_userId_key" ON "Membership"("accountId", "userId");
-- At most one Owner per account.
CREATE UNIQUE INDEX "Membership_one_owner_key" ON "Membership"("accountId") WHERE "role" = 'OWNER';
CREATE INDEX "ManualPayment_accountId_recordedAt_idx" ON "ManualPayment"("accountId", "recordedAt");
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE UNIQUE INDEX "PlatformAdmin_setupTokenHash_key" ON "PlatformAdmin"("setupTokenHash");
CREATE UNIQUE INDEX "PlatformSession_tokenHash_key" ON "PlatformSession"("tokenHash");
CREATE INDEX "PlatformSession_adminId_idx" ON "PlatformSession"("adminId");

-- ─── Foreign keys ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Setting', 'Building', 'UnitType', 'Unit', 'Tenant', 'Lease', 'LeaseCounter', 'LeaseDraft',
    'UserPreference', 'ReminderEvent', 'ReminderDigest', 'Charge', 'Payment', 'PaymentAllocation',
    'PaymentCounter', 'Document', 'Feedback'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      t, t || '_accountId_fkey');
  END LOOP;
END
$$;

-- ─── Row-level security ────────────────────────────────────────────────────────────────────
-- Superusers and the tables' owner (migrations, the worker's account loop, the platform admin)
-- are not affected. The restricted role is.

GRANT USAGE ON SCHEMA public TO propfolio_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO propfolio_tenant;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO propfolio_tenant;
-- Tables added by later migrations are reachable too, but stay invisible until a migration
-- turns on row-level security with a policy for them (see docs/decisions.md).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO propfolio_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO propfolio_tenant;

-- Account-owned tables: only the current account's rows, in and out.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AuditLog', 'Setting', 'Building', 'UnitType', 'Unit', 'Tenant', 'Lease', 'LeaseCounter',
    'LeaseDraft', 'UserPreference', 'ReminderEvent', 'ReminderDigest', 'Charge', 'Payment',
    'PaymentAllocation', 'PaymentCounter', 'Document', 'Feedback', 'Membership'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY account_isolation ON %I USING ("accountId" = current_account_id()) WITH CHECK ("accountId" = current_account_id())',
      t);
  END LOOP;
END
$$;

-- The account itself: read and rename your own; never create, delete or see others.
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_self_read ON "Account" FOR SELECT USING ("id" = current_account_id());
CREATE POLICY account_self_update ON "Account" FOR UPDATE
  USING ("id" = current_account_id()) WITH CHECK ("id" = current_account_id());
-- Plan, trial, payment and suspension fields are changed by the platform admin only.
REVOKE UPDATE ON "Account" FROM propfolio_tenant;
GRANT UPDATE ("name", "updatedAt") ON "Account" TO propfolio_tenant;

-- People: only those who belong to the current account. Creating people (and anything to do
-- with passwords) happens outside customer work.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_in_account_read ON "User" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = "User"."id" AND m."accountId" = current_account_id())
);
CREATE POLICY user_in_account_update ON "User" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = "User"."id" AND m."accountId" = current_account_id())
);

-- Sign-in internals and Propfolio's own records: never reachable from customer work.
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAdmin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Session", "PasswordResetToken", "ManualPayment", "PlatformAdmin", "PlatformSession" FROM propfolio_tenant;
-- Prisma's own bookkeeping table (absent in the scratch database `prisma migrate dev` uses).
DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM propfolio_tenant;
  END IF;
END
$$;
