-- Undo 20261118150000_account_closing. Closed accounts become suspended (nobody can sign in,
-- nothing is deleted); their closing dates are forgotten. The audit log becomes strictly
-- append-only again.
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

UPDATE "Account" SET "status" = 'SUSPENDED', "suspendedAt" = COALESCE("closedAt", now()),
  "suspendedReason" = 'Closed by its Owner' WHERE "status" = 'CLOSED';

DROP INDEX IF EXISTS "Account_reopenTokenHash_key";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "closedAt", DROP COLUMN IF EXISTS "dataDeletedAt",
  DROP COLUMN IF EXISTS "deleteAfter", DROP COLUMN IF EXISTS "deletionReminderSentAt",
  DROP COLUMN IF EXISTS "reopenTokenHash";

ALTER TYPE "AccountStatus" RENAME TO "AccountStatus_old";
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
ALTER TABLE "Account" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Account" ALTER COLUMN "status" TYPE "AccountStatus" USING "status"::text::"AccountStatus";
ALTER TABLE "Account" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "AccountStatus_old";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118150000_account_closing';
