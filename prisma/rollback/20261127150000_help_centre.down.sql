-- Undo 20261127150000_help_centre. Help articles are removed; tickets keep their messages.
DROP TABLE IF EXISTS "HelpArticle";
DROP TYPE IF EXISTS "HelpArticleStatus";
DROP INDEX IF EXISTS "Ticket_agentQueuedAt_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "agentQueuedAt", DROP COLUMN IF EXISTS "handedOverAt",
  DROP COLUMN IF EXISTS "bugIssueNumber", DROP COLUMN IF EXISTS "bugFollowedUpAt";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261127150000_help_centre';
