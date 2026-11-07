-- Undo 20261107090000_self_serve_sign_up. Accounts created by sign-up stay (they are ordinary
-- accounts); only the sign-up bookkeeping, Google links and "keep me signed in" flags go.
DROP TABLE IF EXISTS "FunnelEvent";
DROP TABLE IF EXISTS "LegalAcceptance";
DROP TABLE IF EXISTS "PendingSignUp";
DROP TYPE IF EXISTS "FunnelStep";
DROP TYPE IF EXISTS "LegalDocument";
DROP INDEX IF EXISTS "User_googleSub_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "googleSub";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "persistent";
ALTER TABLE "SignInChallenge" DROP COLUMN IF EXISTS "persistent";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107090000_self_serve_sign_up';
