-- Undo 20261111090000_demo_requests. Demo requests already received are deleted with the table:
-- export them from the platform admin first if they are still needed.
DROP TABLE IF EXISTS "DemoRequest";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111090000_demo_requests';
