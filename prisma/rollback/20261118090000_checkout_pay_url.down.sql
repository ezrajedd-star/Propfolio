-- Undo 20261118090000_checkout_pay_url. Open renewal payment links are forgotten; "Pay now" then
-- creates a new one.
ALTER TABLE "Checkout" DROP COLUMN IF EXISTS "payUrl";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118090000_checkout_pay_url';
