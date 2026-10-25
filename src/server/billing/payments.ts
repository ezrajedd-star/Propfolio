import { Prisma } from "@prisma/client";
import { z } from "zod";

import { can } from "@/domain/auth/roles";
import {
  allocateOldestFirst,
  balanceDue,
  outstanding,
  summariseOverdue,
  validateAllocation,
  type Allocation,
  type OpenCharge,
} from "@/domain/billing/ledger";
import { formatPeso, money, roundMoney } from "@/domain/money/money";
import { fromDbDate, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { isoDateSchema, moneySchema, optionalText, uuidSchema } from "@/schemas/common-fields";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db, type Tx } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";
import { activeChargesWithPaid } from "./charges";

export const PAYMENT_METHODS = ["CASH", "CHEQUE", "BANK_TRANSFER", "ONLINE"] as const;
export const PAYMENT_METHOD_LABELS = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
} as const;

export const recordPaymentSchema = z.object({
  leaseId: uuidSchema("Choose a lease."),
  receivedDate: isoDateSchema("Enter the date the payment was received."),
  amount: moneySchema({ label: "amount received" }),
  method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid." }),
  reference: optionalText(80, "The reference"),
  notes: optionalText(1000, "The note"),
  /** Leave out (or null) to allocate to the oldest unpaid charges automatically. */
  allocations: z
    .array(z.object({ chargeId: uuidSchema(), amount: moneySchema({ label: "allocated amount" }) }))
    .max(500)
    .nullable()
    .optional(),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

function toOpen(c: {
  charge: {
    id: string;
    dueDate: Date;
    type: OpenCharge["type"];
    amount: Prisma.Decimal;
    createdAt: Date;
  };
  paid: ReturnType<typeof money>;
}): OpenCharge {
  return {
    id: c.charge.id,
    dueDate: fromDbDate(c.charge.dueDate),
    type: c.charge.type,
    amount: money(c.charge.amount.toString()),
    paid: c.paid,
    createdAt: c.charge.createdAt.toISOString(),
  };
}

async function nextPaymentNo(tx: Tx, now: Date): Promise<string> {
  const year = Number(manilaToday(now).slice(0, 4));
  const [row] = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "PaymentCounter" ("year", "lastSeq") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "lastSeq" = "PaymentCounter"."lastSeq" + 1
    RETURNING "lastSeq"`;
  return `PAY-${year}-${String(row!.lastSeq).padStart(4, "0")}`;
}

/** Lock the lease row so two people can't allocate the same charge at the same moment. */
async function lockLease(tx: Tx, leaseId: string) {
  await tx.$queryRaw`SELECT id FROM "Lease" WHERE id = ${leaseId}::uuid FOR UPDATE`;
}

const ALLOCATION_MESSAGES = {
  unknown_charge: "One of the charges is no longer open. Reload the page and try again.",
  not_positive: "Each allocated amount must be more than zero.",
  too_many_decimals: "Use at most 2 decimal places.",
  over_charge: "You can't allocate more than a charge's unpaid amount.",
  over_payment: "The allocated amounts add up to more than the payment.",
} as const;

/**
 * Record a payment. By default it goes to the oldest unpaid charges first; staff may adjust
 * how it is split. Anything left over is kept as unapplied credit on the lease.
 */
export async function recordPayment(
  actor: AuditActor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "payment.record");
  const data = parseInput(recordPaymentSchema, input);
  if (data.receivedDate > manilaToday(now)) {
    throw new ValidationError("Please check the highlighted fields.", {
      receivedDate: "The date can't be in the future.",
    });
  }
  const lease = await db.lease.findUnique({ where: { id: data.leaseId } });
  if (!lease || lease.archivedAt)
    throw new ValidationError("Please check the highlighted fields.", {
      leaseId: "Choose a lease from the list.",
    });
  const amount = money(data.amount);

  return db.$transaction(async (tx) => {
    await lockLease(tx, data.leaseId);
    const open = (await activeChargesWithPaid(tx, data.leaseId)).map(toOpen);
    let allocations: Allocation[];
    if (data.allocations && data.allocations.length > 0) {
      allocations = data.allocations.map((a) => ({
        chargeId: a.chargeId,
        amount: money(a.amount),
      }));
      const problem = validateAllocation(open, amount, allocations);
      if (problem)
        throw new ValidationError(ALLOCATION_MESSAGES[problem.kind], {
          allocations: ALLOCATION_MESSAGES[problem.kind],
        });
    } else {
      allocations = allocateOldestFirst(open, amount).allocations;
    }
    const paymentNo = await nextPaymentNo(tx, now);
    const payment = await tx.payment.create({
      data: {
        paymentNo,
        leaseId: data.leaseId,
        receivedDate: toDbDate(data.receivedDate),
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        createdById: actor.id,
        allocations: {
          create: allocations.map((a) => ({ chargeId: a.chargeId, amount: a.amount.toFixed(2) })),
        },
      },
    });
    const allocated = allocations.reduce((s, a) => s.plus(a.amount), money(0));
    await writeAudit(
      {
        actor,
        action: "payment.record",
        entityType: "Lease",
        entityId: data.leaseId,
        changes: {
          paymentNo,
          amount: data.amount,
          receivedDate: data.receivedDate,
          method: data.method,
          reference: data.reference,
          allocations: allocations.map((a) => ({
            chargeId: a.chargeId,
            amount: a.amount.toFixed(2),
          })),
          unapplied: roundMoney(amount.minus(allocated)).toFixed(2),
        },
        meta,
      },
      tx,
    );
    return payment;
  });
}

/** Void a payment (wrong amount, bounced cheque…). The record stays, marked void, with the reason. */
export async function voidPayment(
  actor: AuditActor,
  paymentId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertCan(actor, "payment.record");
  const { reason } = parseInput(
    z.object({
      reason: z.string().trim().min(5, "Please give the reason in a few words.").max(500),
    }),
    input,
  );
  if (!isUuid(paymentId)) throw new NotFoundError("We couldn't find that payment.");
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new NotFoundError("We couldn't find that payment.");
  if (p.status === "VOID") throw new ValidationError("This payment was already voided.");
  return db.$transaction(async (tx) => {
    const v = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "VOID", voidReason: reason, voidedAt: now, voidedById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: "payment.void",
        entityType: "Lease",
        entityId: p.leaseId,
        metadata: { paymentNo: p.paymentNo, amount: p.amount.toFixed(2), reason },
        meta,
      },
      tx,
    );
    return v;
  });
}

/** Unapplied credit on a lease: posted payment amounts not yet allocated to any charge. */
async function creditOf(tx: Tx | typeof db, leaseId: string) {
  const payments = await tx.payment.findMany({
    where: { leaseId, status: "POSTED" },
    include: { allocations: { select: { amount: true } } },
    orderBy: { receivedDate: "asc" },
  });
  return payments
    .map((p) => ({
      payment: p,
      left: roundMoney(
        money(p.amount.toString()).minus(
          p.allocations.reduce((s, a) => s.plus(a.amount.toString()), money(0)),
        ),
      ),
    }))
    .filter((x) => x.left.greaterThan(0));
}

/** Use unapplied credit (over-payments) to pay the oldest unpaid charges. */
export async function applyCredit(actor: AuditActor, leaseId: string, meta: RequestMeta) {
  assertCan(actor, "payment.record");
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  return db.$transaction(async (tx) => {
    await lockLease(tx, leaseId);
    const credits = await creditOf(tx, leaseId);
    let open = (await activeChargesWithPaid(tx, leaseId)).map(toOpen);
    let applied = money(0);
    for (const c of credits) {
      const { allocations } = allocateOldestFirst(open, c.left);
      if (!allocations.length) break;
      await tx.paymentAllocation.createMany({
        data: allocations.map((a) => ({
          paymentId: c.payment.id,
          chargeId: a.chargeId,
          amount: a.amount.toFixed(2),
        })),
      });
      for (const a of allocations) {
        applied = applied.plus(a.amount);
        open = open.map((o) => (o.id === a.chargeId ? { ...o, paid: o.paid.plus(a.amount) } : o));
      }
    }
    if (applied.greaterThan(0)) {
      await writeAudit(
        {
          actor,
          action: "payment.apply_credit",
          entityType: "Lease",
          entityId: leaseId,
          metadata: { applied: applied.toFixed(2) },
          meta,
        },
        tx,
      );
    }
    return { applied: applied.toFixed(2) };
  });
}

// ─── Reading ───────────────────────────────────────────────────────────────────

export interface LedgerCharge {
  id: string;
  type: "RENT" | "DEPOSIT" | "ADVANCE" | "OTHER";
  description: string;
  dueDate: IsoDate;
  amount: string;
  paid: string;
  outstanding: string;
  status: "ACTIVE" | "CANCELLED" | "VOID";
  statusReason: string | null;
  overdue: boolean;
  /** "Paid", "Part paid", "Overdue", "Due", "Upcoming", "Cancelled", "Voided" */
  state: string;
}

export interface LedgerPayment {
  id: string;
  paymentNo: string;
  receivedDate: IsoDate;
  amount: string;
  method: (typeof PAYMENT_METHODS)[number];
  reference: string | null;
  notes: string | null;
  status: "POSTED" | "VOID";
  voidReason: string | null;
  unapplied: string;
  allocations: { chargeId: string; description: string; amount: string }[];
}

export interface LeaseLedger {
  charges: LedgerCharge[];
  payments: LedgerPayment[];
  totals: {
    charged: string;
    paid: string;
    balanceDue: string;
    overdue: string;
    overdueCount: number;
    credit: string;
    totalOutstanding: string;
  };
  canRecord: boolean;
}

export async function getLeaseLedger(
  actor: AuditActor,
  leaseId: string,
  now = new Date(),
): Promise<LeaseLedger> {
  assertCan(actor, "payment.view");
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const lease = await db.lease.findUnique({ where: { id: leaseId }, select: { archivedAt: true } });
  if (!lease) throw new NotFoundError("We couldn't find that lease.");
  const today = manilaToday(now);
  const [charges, payments] = await Promise.all([
    db.charge.findMany({
      where: { leaseId },
      include: {
        allocations: { where: { payment: { status: "POSTED" } }, select: { amount: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    db.payment.findMany({
      where: { leaseId },
      include: { allocations: { include: { charge: { select: { description: true } } } } },
      orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const ledgerCharges: LedgerCharge[] = charges.map((c) => {
    const amount = money(c.amount.toString());
    const paid = c.allocations.reduce((s, a) => s.plus(a.amount.toString()), money(0));
    const open = outstanding({ amount, paid });
    const dueDate = fromDbDate(c.dueDate);
    const overdue = c.status === "ACTIVE" && dueDate < today && open.greaterThan(0);
    const state =
      c.status === "CANCELLED"
        ? "Cancelled"
        : c.status === "VOID"
          ? "Voided"
          : open.lessThanOrEqualTo(0)
            ? "Paid"
            : overdue
              ? paid.greaterThan(0)
                ? "Overdue (part paid)"
                : "Overdue"
              : paid.greaterThan(0)
                ? "Part paid"
                : dueDate === today
                  ? "Due today"
                  : "Upcoming";
    return {
      id: c.id,
      type: c.type,
      description: c.description,
      dueDate,
      amount: amount.toFixed(2),
      paid: paid.toFixed(2),
      outstanding: open.toFixed(2),
      status: c.status,
      statusReason: c.statusReason,
      overdue,
      state,
    };
  });

  const ledgerPayments: LedgerPayment[] = payments.map((p) => {
    const allocated = p.allocations.reduce((s, a) => s.plus(a.amount.toString()), money(0));
    return {
      id: p.id,
      paymentNo: p.paymentNo,
      receivedDate: fromDbDate(p.receivedDate),
      amount: p.amount.toFixed(2),
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      status: p.status,
      voidReason: p.voidReason,
      unapplied:
        p.status === "POSTED"
          ? roundMoney(money(p.amount.toString()).minus(allocated)).toFixed(2)
          : "0.00",
      allocations: p.allocations.map((a) => ({
        chargeId: a.chargeId,
        description: a.charge.description,
        amount: a.amount.toFixed(2),
      })),
    };
  });

  const active = ledgerCharges
    .filter((c) => c.status === "ACTIVE")
    .map((c) => ({ dueDate: c.dueDate, amount: money(c.amount), paid: money(c.paid) }));
  const overdue = summariseOverdue(lease.archivedAt ? [] : active, today);
  const credit = ledgerPayments.reduce((s, p) => s.plus(p.unapplied), money(0));
  return {
    charges: ledgerCharges,
    payments: ledgerPayments,
    totals: {
      charged: active.reduce((s, c) => s.plus(c.amount), money(0)).toFixed(2),
      paid: ledgerPayments
        .filter((p) => p.status === "POSTED")
        .reduce((s, p) => s.plus(p.amount), money(0))
        .toFixed(2),
      balanceDue: balanceDue(active, today).toFixed(2),
      totalOutstanding: active.reduce((s, c) => s.plus(outstanding(c)), money(0)).toFixed(2),
      overdue: overdue.total.toFixed(2),
      overdueCount: overdue.count,
      credit: credit.toFixed(2),
    },
    canRecord: can(actor.role, "payment.record") && !lease.archivedAt,
  };
}

/** Open charges for the record-payment form, oldest first. */
export async function openChargesForPayment(actor: AuditActor, leaseId: string, now = new Date()) {
  assertCan(actor, "payment.record");
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const today = manilaToday(now);
  const rows = (await activeChargesWithPaid(db, leaseId)).map((c) => ({
    ...toOpen(c),
    description: c.charge.description,
  }));
  return rows
    .filter((c) => outstanding(c).greaterThan(0))
    .map((c) => ({
      id: c.id,
      type: c.type,
      description: c.description,
      dueDate: c.dueDate,
      amount: c.amount.toFixed(2),
      paid: c.paid.toFixed(2),
      outstanding: outstanding(c).toFixed(2),
      overdue: c.dueDate < today,
      createdAt: c.createdAt!,
    }));
}

export interface PaymentListItem {
  id: string;
  paymentNo: string;
  receivedDate: IsoDate;
  amount: string;
  method: (typeof PAYMENT_METHODS)[number];
  reference: string | null;
  status: "POSTED" | "VOID";
  leaseId: string;
  refNo: string;
  tenantName: string;
  unitLabel: string;
}

/** Payments received in a date range (Payments page, Collections report). */
export async function listPayments(
  actor: AuditActor,
  opts: { from?: IsoDate; to?: IsoDate; includeVoid?: boolean } = {},
): Promise<PaymentListItem[]> {
  assertCan(actor, "payment.view");
  const rows = await db.payment.findMany({
    where: {
      ...(opts.includeVoid ? {} : { status: "POSTED" }),
      ...(opts.from || opts.to
        ? {
            receivedDate: {
              ...(opts.from ? { gte: toDbDate(opts.from) } : {}),
              ...(opts.to ? { lte: toDbDate(opts.to) } : {}),
            },
          }
        : {}),
    },
    include: {
      lease: {
        select: {
          id: true,
          refNo: true,
          tenant: { select: { displayName: true } },
          unit: { select: { unitNumber: true, building: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((p) => ({
    id: p.id,
    paymentNo: p.paymentNo,
    receivedDate: fromDbDate(p.receivedDate),
    amount: p.amount.toFixed(2),
    method: p.method,
    reference: p.reference,
    status: p.status,
    leaseId: p.lease.id,
    refNo: p.lease.refNo,
    tenantName: p.lease.tenant.displayName,
    unitLabel: `Unit ${p.lease.unit.unitNumber}, ${p.lease.unit.building.name}`,
  }));
}

/** Data for the printable acknowledgement (not an official receipt). */
export async function getPaymentAcknowledgement(actor: AuditActor, paymentId: string) {
  assertCan(actor, "payment.view");
  if (!isUuid(paymentId)) throw new NotFoundError("We couldn't find that payment.");
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      allocations: { include: { charge: { select: { description: true, dueDate: true } } } },
      lease: {
        select: {
          id: true,
          refNo: true,
          tenant: { select: { displayName: true, registeredName: true } },
          unit: {
            select: { unitNumber: true, building: { select: { name: true, address: true } } },
          },
        },
      },
    },
  });
  if (!p) throw new NotFoundError("We couldn't find that payment.");
  const recorder = p.createdById
    ? await db.user.findUnique({ where: { id: p.createdById }, select: { name: true } })
    : null;
  const allocated = p.allocations.reduce((s, a) => s.plus(a.amount.toString()), money(0));
  return {
    paymentNo: p.paymentNo,
    status: p.status,
    voidReason: p.voidReason,
    receivedDate: fromDbDate(p.receivedDate),
    amount: p.amount.toFixed(2),
    amountLabel: formatPeso(p.amount.toString()),
    method: PAYMENT_METHOD_LABELS[p.method],
    reference: p.reference,
    recordedBy: recorder?.name ?? null,
    recordedAt: p.createdAt,
    lease: { id: p.lease.id, refNo: p.lease.refNo },
    tenantName: p.lease.tenant.registeredName ?? p.lease.tenant.displayName,
    unitLabel: `Unit ${p.lease.unit.unitNumber}, ${p.lease.unit.building.name}`,
    address: p.lease.unit.building.address,
    lines: p.allocations.map((a) => ({
      description: a.charge.description,
      dueDate: fromDbDate(a.charge.dueDate),
      amount: a.amount.toFixed(2),
    })),
    unapplied: roundMoney(money(p.amount.toString()).minus(allocated)).toFixed(2),
  };
}
