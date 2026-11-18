-- Pay-by-link providers (Xendit invoices): keep the payment page so "Pay now" reopens it.
ALTER TABLE "Checkout" ADD COLUMN "payUrl" TEXT;
