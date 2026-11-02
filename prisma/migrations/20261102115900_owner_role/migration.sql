-- The Owner role (an Admin who also controls billing and can't be removed). Added in its own
-- migration because Postgres can't use a new enum value in the transaction that adds it.
ALTER TYPE "Role" ADD VALUE 'OWNER' BEFORE 'ADMIN';
