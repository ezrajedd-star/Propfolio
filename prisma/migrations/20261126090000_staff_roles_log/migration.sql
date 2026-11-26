-- Ops console phase 1: staff roles and the append-only staff log.
-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_OWNER', 'PLATFORM_SUPPORT', 'PLATFORM_READONLY');

-- CreateEnum
CREATE TYPE "StaffLogKind" AS ENUM ('VIEW', 'CHANGE', 'EXPORT', 'SETTING', 'SIGN_IN');

-- AlterTable
ALTER TABLE "PlatformAdmin" ADD COLUMN     "role" "PlatformRole" NOT NULL DEFAULT 'PLATFORM_READONLY';

-- CreateTable
CREATE TABLE "StaffLog" (
    "seq" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" UUID,
    "adminName" TEXT,
    "adminRole" "PlatformRole",
    "kind" "StaffLogKind" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "accountId" UUID,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "StaffLog_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "StaffLog_at_idx" ON "StaffLog"("at");

-- CreateIndex
CREATE INDEX "StaffLog_adminId_at_idx" ON "StaffLog"("adminId", "at");

-- CreateIndex
CREATE INDEX "StaffLog_accountId_at_idx" ON "StaffLog"("accountId", "at");


-- Everyone who was a platform admin before roles existed keeps full access.
UPDATE "PlatformAdmin" SET "role" = 'PLATFORM_OWNER';

-- The staff log is append-only, like the audit log.
CREATE FUNCTION staff_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'StaffLog is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER staff_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "StaffLog"
  FOR EACH ROW EXECUTE FUNCTION staff_log_reject_change();

CREATE TRIGGER staff_log_no_truncate
  BEFORE TRUNCATE ON "StaffLog"
  FOR EACH STATEMENT EXECUTE FUNCTION staff_log_reject_change();

-- Never reachable from customer work.
ALTER TABLE "StaffLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StaffLog" FROM propfolio_tenant;
REVOKE ALL ON SEQUENCE "StaffLog_seq_seq" FROM propfolio_tenant;
