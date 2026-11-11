-- Undo 20261111120000_website_leads. Requests and applications already received are deleted with
-- the table: copy them from the platform admin first if they are still needed.
DROP TABLE IF EXISTS "WebsiteLead";
DROP TYPE IF EXISTS "WebsiteLeadKind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111120000_website_leads';
