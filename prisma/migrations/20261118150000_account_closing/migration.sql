-- Owners can close their account: reopenable for 90 days, then its data is deleted.

-- AlterEnum
ALTER TYPE "AccountStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "dataDeletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deleteAfter" DATE,
ADD COLUMN     "deletionReminderSentAt" TIMESTAMPTZ(3),
ADD COLUMN     "reopenTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_reopenTokenHash_key" ON "Account"("reopenTokenHash");

-- The audit log stays append-only, with one exception: deleting a closed account's own entries
-- when its data is deleted. That needs the system (never the customer role) to name the account
-- in the transaction (SET LOCAL propfolio.purge_account); updates and TRUNCATE are always refused.
CREATE OR REPLACE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user <> 'propfolio_tenant'
       AND OLD."accountId" IS NOT NULL
       AND current_setting('propfolio.purge_account', true) = OLD."accountId"::text THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
