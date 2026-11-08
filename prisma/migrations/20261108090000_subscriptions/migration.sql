-- Subscriptions to Propfolio (public launch, Phase 5): subscriptions, checkouts, provider events
-- (webhooks), payment records and their numbering. All Propfolio's own records.
-- Reversible: prisma/rollback/20261108090000_subscriptions.down.sql

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "CheckoutKind" AS ENUM ('SUBSCRIBE', 'UPGRADE', 'RENEWAL');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('OPEN', 'PAID', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "currentPeriodStart" DATE NOT NULL,
    "currentPeriodEnd" DATE NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pendingPlan" "Plan",
    "pastDueSince" TIMESTAMPTZ(3),
    "graceReminderDay" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkout" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" "CheckoutKind" NOT NULL,
    "plan" "Plan" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" UUID,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "outcome" TEXT,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "description" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "checkoutId" UUID,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_accountId_key" ON "Subscription"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_providerRef_key" ON "Checkout"("providerRef");

-- CreateIndex
CREATE INDEX "Checkout_accountId_createdAt_idx" ON "Checkout"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderEvent_receivedAt_idx" ON "ProviderEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_provider_providerEventId_key" ON "ProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_number_key" ON "SubscriptionInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_checkoutId_key" ON "SubscriptionInvoice"("checkoutId");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_accountId_issuedAt_idx" ON "SubscriptionInvoice"("accountId", "issuedAt");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_issuedAt_idx" ON "SubscriptionInvoice"("issuedAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Propfolio's own records: never reachable from customer work.
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Checkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceCounter" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Subscription", "Checkout", "ProviderEvent", "SubscriptionInvoice", "InvoiceCounter" FROM propfolio_tenant;
