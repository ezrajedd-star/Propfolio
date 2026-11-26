-- Undo 20261127090000_pipeline. Leads and their timelines are removed (Brevo keeps its copy).
DROP TABLE IF EXISTS "LeadActivity";
DROP TABLE IF EXISTS "Lead";
DROP TYPE IF EXISTS "LeadActivityKind";
DROP TYPE IF EXISTS "LeadStage";
DROP TYPE IF EXISTS "LeadSource";
DROP TYPE IF EXISTS "LeadType";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261127090000_pipeline';
