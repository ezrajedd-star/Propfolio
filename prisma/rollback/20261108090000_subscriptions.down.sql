-- Undo 20261108090000_subscriptions. Payment records are financial records: export them first
-- (platform admin → Payments → Export). Accounts keep their plan and paid-until day.
DROP TABLE IF EXISTS "SubscriptionInvoice";
DROP TABLE IF EXISTS "InvoiceCounter";
DROP TABLE IF EXISTS "ProviderEvent";
DROP TABLE IF EXISTS "Checkout";
DROP TABLE IF EXISTS "Subscription";
DROP TYPE IF EXISTS "CheckoutStatus";
DROP TYPE IF EXISTS "CheckoutKind";
DROP TYPE IF EXISTS "SubscriptionStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261108090000_subscriptions';
