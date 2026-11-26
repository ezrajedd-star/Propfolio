-- Undo 20261126090000_staff_roles_log. Staff roles and the staff log are removed (every
-- platform admin has full access again, as before).
DROP TABLE IF EXISTS "StaffLog";
DROP FUNCTION IF EXISTS staff_log_reject_change();
ALTER TABLE "PlatformAdmin" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "StaffLogKind";
DROP TYPE IF EXISTS "PlatformRole";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126090000_staff_roles_log';
