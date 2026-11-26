-- Undo 20261126150000_support_access. Open support sessions end; grants are forgotten.
UPDATE "Session" SET "revokedAt" = now() WHERE "supportGrantId" IS NOT NULL AND "revokedAt" IS NULL;
DROP TABLE IF EXISTS "SupportAccessGrant";
DROP INDEX IF EXISTS "Session_supportGrantId_idx";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "supportGrantId", DROP COLUMN IF EXISTS "supportAdminId",
  DROP COLUMN IF EXISTS "supportAdminName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isSupportStaff";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126150000_support_access';
