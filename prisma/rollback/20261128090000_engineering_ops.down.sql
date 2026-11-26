-- Undo 20261128090000_engineering_ops.
DROP TABLE IF EXISTS "RestoreCheck";
DROP TABLE IF EXISTS "OpsRequest";
DROP TYPE IF EXISTS "OpsRequestStatus";
DROP TYPE IF EXISTS "OpsRequestKind";
ALTER TABLE "Incident" DROP COLUMN IF EXISTS "diagnostics", DROP COLUMN IF EXISTS "githubIssueNumber",
  DROP COLUMN IF EXISTS "publicNote", DROP COLUMN IF EXISTS "publicNoteAt";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261128090000_engineering_ops';
