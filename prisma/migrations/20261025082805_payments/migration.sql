-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('RENT', 'DEPOSIT', 'ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'VOID');

-- CreateTable
CREATE TABLE "Charge" (
    "id" UUID NOT NULL,
    "leaseId" UUID NOT NULL,
    "type" "ChargeType" NOT NULL,
    "key" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "statusAt" TIMESTAMPTZ(3),
    "statusById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "leaseId" UUID NOT NULL,
    "receivedDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "voidReason" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,

    CONSTRAINT "PaymentCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "Charge_leaseId_status_idx" ON "Charge"("leaseId", "status");

-- CreateIndex
CREATE INDEX "Charge_dueDate_idx" ON "Charge"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNo_key" ON "Payment"("paymentNo");

-- CreateIndex
CREATE INDEX "Payment_leaseId_status_idx" ON "Payment"("leaseId", "status");

-- CreateIndex
CREATE INDEX "Payment_receivedDate_idx" ON "Payment"("receivedDate");

-- CreateIndex
CREATE INDEX "PaymentAllocation_chargeId_idx" ON "PaymentAllocation"("chargeId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active generated charge per lease, type and period.
CREATE UNIQUE INDEX "Charge_active_key" ON "Charge" ("leaseId", "type", "key") WHERE "status" = 'ACTIVE' AND "key" IS NOT NULL;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_check" CHECK ("amount" > 0);
