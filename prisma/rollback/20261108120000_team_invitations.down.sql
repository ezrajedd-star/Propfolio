-- Undo 20261108120000_team_invitations. People who already joined stay members; only open
-- invitations stop working.
DROP TABLE IF EXISTS "Invitation";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261108120000_team_invitations';
