import type { Plan, Prisma } from "@prisma/client";

import { PLAN_CONFIG } from "@/domain/plans/plans";
import { invoiceNumber } from "@/domain/subscription/subscription";
import { toDbDate, type IsoDate } from "@/domain/time/calendar-date";

type Tx = Prisma.TransactionClient;

export interface PaymentRecordInput {
  accountId: string;
  plan: Plan;
  kind: "SUBSCRIBE" | "UPGRADE" | "RENEWAL";
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amount: string;
  method: string;
  provider: string;
  providerRef: string | null;
  checkoutId: string;
  issuedAt: Date;
}

/**
 * Record a payment received (number, date, customer name and address, plan, amount, method,
 * provider reference), inside the payment's transaction. Numbers run per year without gaps.
 *
 * NOT a BIR official invoice, and never labelled as one. When the accountant confirms the
 * invoicing method (e.g. a CAS-registered system or an e-invoicing provider), plug it in HERE:
 * issue the official invoice from these same facts and store its reference alongside.
 */
export async function issuePaymentRecord(tx: Tx, p: PaymentRecordInput) {
  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric" }).format(
      p.issuedAt,
    ),
  );
  const counter = await tx.invoiceCounter.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  const [account, address] = await Promise.all([
    tx.account.findUniqueOrThrow({ where: { id: p.accountId }, select: { name: true } }),
    tx.setting.findUnique({
      where: { accountId_key: { accountId: p.accountId, key: "companyAddress" } },
      select: { value: true },
    }),
  ]);
  const label = PLAN_CONFIG[p.plan].label;
  const description =
    p.kind === "UPGRADE"
      ? `Upgrade to Propfolio ${label} for the rest of the period`
      : `Propfolio ${label}, monthly`;
  return tx.subscriptionInvoice.create({
    data: {
      number: invoiceNumber(year, counter.last),
      accountId: p.accountId,
      issuedAt: p.issuedAt,
      customerName: account.name,
      customerAddress: typeof address?.value === "string" ? address.value : "",
      plan: p.plan,
      description,
      periodStart: toDbDate(p.periodStart),
      periodEnd: toDbDate(p.periodEnd),
      amount: p.amount,
      method: p.method,
      provider: p.provider,
      providerRef: p.providerRef,
      checkoutId: p.checkoutId,
    },
  });
}
