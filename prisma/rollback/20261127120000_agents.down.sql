-- Undo 20261127120000_agents. Agent settings, logs, costs and approvals are removed.
DROP TABLE IF EXISTS "AgentState";
DROP TABLE IF EXISTS "AgentAutonomy";
DROP TABLE IF EXISTS "AgentActionLog";
DROP TABLE IF EXISTS "AgentUsage";
DROP TABLE IF EXISTS "AgentSession";
DROP TABLE IF EXISTS "Approval";
DROP TYPE IF EXISTS "ApprovalStatus";
DROP TYPE IF EXISTS "AutonomyLevel";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261127120000_agents';
