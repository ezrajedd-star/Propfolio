-- Undo 20261127180000_digest.
DROP TABLE IF EXISTS "DigestSnapshot";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261127180000_digest';
