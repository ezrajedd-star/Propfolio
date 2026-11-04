-- Undo 20261104090000_trial_reminders. Only the reminder log is dropped; no customer data.
DROP TABLE IF EXISTS "TrialReminder";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261104090000_trial_reminders';
