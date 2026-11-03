-- Undo migrations 20261102120000_accounts and 20261102115900_owner_role.
--
-- Only possible while all data is in a single account (the state right after the migration).
-- It stops with an error if there is more than one account. Back up first:
--   pg_dump -Fc "$DATABASE_URL" > before-rollback.dump
-- Then run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/rollback/20261102120000_accounts.down.sql
-- and deploy the app version from before the migration. Platform admins, manual payments and
-- platform sessions are removed; everyone signs in again.

DO $$
BEGIN
  IF (SELECT count(*) FROM "Account") > 1 THEN
    RAISE EXCEPTION 'More than one account exists; this rollback would mix their data. Restore a backup instead.';
  END IF;
END
$$;

-- Row-level security off.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AuditLog', 'Setting', 'Building', 'UnitType', 'Unit', 'Tenant', 'Lease', 'LeaseCounter',
    'LeaseDraft', 'UserPreference', 'ReminderEvent', 'ReminderDigest', 'Charge', 'Payment',
    'PaymentAllocation', 'PaymentCounter', 'Document', 'Feedback', 'Membership'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS account_isolation ON %I', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
DROP POLICY IF EXISTS account_self_read ON "Account";
DROP POLICY IF EXISTS account_self_update ON "Account";
DROP POLICY IF EXISTS user_in_account_read ON "User";
DROP POLICY IF EXISTS user_in_account_update ON "User";
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" DISABLE ROW LEVEL SECURITY;

-- Roles and "turned off" go back onto the user. The Owner becomes an Admin again.
ALTER TABLE "User" ADD COLUMN "role" "Role", ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" u SET "role" = CASE WHEN m."role" = 'OWNER' THEN 'ADMIN'::"Role" ELSE m."role" END,
                    "isActive" = m."isActive"
FROM "Membership" m WHERE m."userId" = u."id";
-- People with no membership (none expected) become turned-off viewers.
UPDATE "User" SET "role" = 'VIEWER', "isActive" = false WHERE "role" IS NULL;
ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

DELETE FROM "Session";
ALTER TABLE "Session" DROP CONSTRAINT "Session_accountId_fkey", DROP COLUMN "accountId";

-- Keys and indexes back to company-wide.
ALTER TABLE "LeaseCounter" DROP CONSTRAINT "LeaseCounter_pkey", ADD CONSTRAINT "LeaseCounter_pkey" PRIMARY KEY ("year");
ALTER TABLE "PaymentCounter" DROP CONSTRAINT "PaymentCounter_pkey", ADD CONSTRAINT "PaymentCounter_pkey" PRIMARY KEY ("year");
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey", ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("key");
ALTER TABLE "UserPreference" DROP CONSTRAINT "UserPreference_pkey", ADD CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId", "key");

DROP INDEX "Building_accountId_code_key";
DROP INDEX "Building_accountId_code_ci_key";
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");
CREATE UNIQUE INDEX "Building_code_ci_key" ON "Building" (lower("code"));
DROP INDEX "UnitType_accountId_name_key";
DROP INDEX "UnitType_accountId_name_ci_key";
CREATE UNIQUE INDEX "UnitType_name_key" ON "UnitType"("name");
CREATE UNIQUE INDEX "UnitType_name_ci_key" ON "UnitType" (lower("name"));
DROP INDEX "Lease_accountId_refNo_key";
CREATE UNIQUE INDEX "Lease_refNo_key" ON "Lease"("refNo");
DROP INDEX "Lease_accountId_status_idx";
CREATE INDEX "Lease_status_idx" ON "Lease"("status");
DROP INDEX "Payment_accountId_paymentNo_key";
CREATE UNIQUE INDEX "Payment_paymentNo_key" ON "Payment"("paymentNo");
DROP INDEX "Payment_accountId_receivedDate_idx";
CREATE INDEX "Payment_receivedDate_idx" ON "Payment"("receivedDate");
DROP INDEX "LeaseDraft_accountId_userId_key";
CREATE UNIQUE INDEX "LeaseDraft_userId_key" ON "LeaseDraft"("userId");
DROP INDEX "ReminderDigest_accountId_digestDate_key";
CREATE UNIQUE INDEX "ReminderDigest_digestDate_key" ON "ReminderDigest"("digestDate");
DROP INDEX "ReminderEvent_accountId_status_scheduledDate_idx";
CREATE INDEX "ReminderEvent_status_scheduledDate_idx" ON "ReminderEvent"("status", "scheduledDate");
DROP INDEX "Charge_accountId_dueDate_idx";
CREATE INDEX "Charge_dueDate_idx" ON "Charge"("dueDate");
DROP INDEX "Feedback_accountId_status_createdAt_idx";
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- The account column comes off every table (its indexes and keys go with it).
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_accountId_fkey";
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AuditLog', 'Setting', 'Building', 'UnitType', 'Unit', 'Tenant', 'Lease', 'LeaseCounter',
    'LeaseDraft', 'UserPreference', 'ReminderEvent', 'ReminderDigest', 'Charge', 'Payment',
    'PaymentAllocation', 'PaymentCounter', 'Document', 'Feedback'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN "accountId"', t);
  END LOOP;
END
$$;

DROP TABLE "PlatformSession", "PlatformAdmin", "ManualPayment", "Membership", "Account";
DROP TYPE "AccountStatus";
DROP TYPE "Plan";
DROP FUNCTION current_account_id();

-- Remove the OWNER role value (Postgres can't drop one enum value: rebuild the type).
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEASING_STAFF', 'VIEWER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";
ALTER TABLE "AuditLog" ALTER COLUMN "actorRole" TYPE "Role" USING (
  CASE WHEN "actorRole"::text = 'OWNER' THEN 'ADMIN' ELSE "actorRole"::text END
)::"Role";
ALTER TABLE "Feedback" ALTER COLUMN "role" TYPE "Role" USING (
  CASE WHEN "role"::text = 'OWNER' THEN 'ADMIN' ELSE "role"::text END
)::"Role";
DROP TYPE "Role_old";

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM propfolio_tenant;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM propfolio_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM propfolio_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM propfolio_tenant;
REVOKE USAGE ON SCHEMA public FROM propfolio_tenant;
-- The role itself is shared by every database on the server, so it is left in place.

DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN ('20261102120000_accounts', '20261102115900_owner_role');
