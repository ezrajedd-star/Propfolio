-- Undo 20261126120000_monitoring. Incident history and heartbeats are removed.
DROP TABLE IF EXISTS "Incident";
DROP TABLE IF EXISTS "SystemHeartbeat";
DROP TYPE IF EXISTS "IncidentStatus";
DROP TYPE IF EXISTS "IncidentSeverity";
DROP TYPE IF EXISTS "IncidentSource";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126120000_monitoring';
