-- Undo 20261118120000_website_stats. The visit and sign-up counts are deleted with the table.
DROP TABLE IF EXISTS "WebsiteStat";
DROP TYPE IF EXISTS "WebsiteStatKind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118120000_website_stats';
