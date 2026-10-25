import { Prisma, type Charge } from "@prisma/client";
import { z } from "zod";

import { planCharges, type RentTerms } from "@/domain/billing/rent-schedule";
import {
  chargesToCancelOnTermination,
  planRegeneration,
  type ExistingCharge,
  type RegenerationPlan,
} from "@/domain/billing/regenerate";
import { money, type Money } from "@/domain/money/money";
import { fromDbDate, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { isoDateSchema, moneySchema, requiredText } from "@/schemas/common-fields";
import { updateLeaseSchema } from "@/schemas/lease";
import { writeAudit, type AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db, type DbClient } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/request-meta";
import { parseInput } from "@/server/validation";

/** Active charges of a lease with how much posted payments have covered. */
export async function activeChargesWithPaid(client: DbClient, leaseId: string) {
  const charges = await client.charge.findMany({
    where: { leaseId, status: "ACTIVE" },
    include: {
      allocations: { where: { payment: { status: "POSTED" } }, select: { amount: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  return charges.map((c) => ({
    charge: c,
    paid: c.allocations.reduce((s, a) => s.plus(a.amount.toString()), money(0)),
  }));
}

function toExisting(c: Charge, paid: Money): ExistingCharge {
  return {
    id: c.id,
    type: c.type,
    key: c.type === "OTHER" ? null : c.key,
    dueDate: fromDbDate(c.dueDate),
    amount: money(c.amount.toString()),
    paid,
    description: c.description,
  };
}

type LeaseTermsRow = {
  startDate: Date;
  endDate: Date;
  monthlyRent: Prisma.Decimal;
  rentDueDay: number;
  securityDeposit: Prisma.Decimal;
  advanceRentType: RentTerms["advanceRentType"];
  advanceRentMonths: number | null;
  advanceRentAmount: Prisma.Decimal | null;
  escalationType: RentTerms["escalationType"];
  escalationPercent: Prisma.Decimal | null;
  escalationEveryMonths: number | null;
  escalationSteps: Prisma.JsonValue;
};

export function rentTermsOf(l: LeaseTermsRow): RentTerms {
  return {
    startDate: fromDbDate(l.startDate),
    endDate: fromDbDate(l.endDate),
    monthlyRent: l.monthlyRent.toString(),
    rentDueDay: l.rentDueDay,
    securityDeposit: l.securityDeposit.toString(),
    advanceRentType: l.advanceRentType,
    advanceRentMonths: l.advanceRentMonths,
    advanceRentAmount: l.advanceRentAmount?.toString() ?? null,
    escalationType: l.escalationType,
    escalationPercent: l.escalationPercent?.toString() ?? null,
    escalationEveryMonths: l.escalationEveryMonths,
    escalationSteps: (l.escalationSteps as RentTerms["escalationSteps"]) ?? null,
  };
}

/**
 * Bring a lease's generated charges in line with its terms:
 * - new lease: creates the whole schedule (rent for every period, deposit, advance),
 * - changed terms: replaces only future unpaid charges (paid or already-due ones are kept),
 * - ended early: cancels unpaid rent due after the last day.
 * Cancellations are recorded on the charge (reason) and in the audit log.
 */
export async function syncLeaseCharges(
  leaseId: string,
  actor: AuditActor | null,
  now = new Date(),
  reason = "Lease terms changed",
) {
  const today = manilaToday(now);
  return db.$transaction(async (tx) => {
    const lease = await tx.lease.findUniqueOrThrow({ where: { id: leaseId } });
    const current = await activeChargesWithPaid(tx, leaseId);
    const existing = current.map((c) => toExisting(c.charge, c.paid));

    let plan: RegenerationPlan;
    if (lease.terminationDate) {
      plan = {
        create: [],
        cancel: chargesToCancelOnTermination(existing, fromDbDate(lease.terminationDate)),
        keptDifferent: [],
      };
      reason = `Lease ended early on ${formatIsoDate(fromDbDate(lease.terminationDate))}`;
    } else if (lease.archivedAt) {
      return { created: 0, cancelled: 0 };
    } else {
      plan = planRegeneration(existing, planCharges(rentTermsOf(lease)), today);
    }

    if (plan.cancel.length) {
      await tx.charge.updateMany({
        where: { id: { in: plan.cancel.map((c) => c.id) }, status: "ACTIVE" },
        data: {
          status: "CANCELLED",
          statusReason: reason,
          statusAt: now,
          statusById: actor?.id ?? null,
        },
      });
    }
    if (plan.create.length) {
      await tx.charge.createMany({
        data: plan.create.map((p) => ({
          leaseId,
          type: p.type,
          key: p.key,
          periodStart: p.periodStart ? toDbDate(p.periodStart) : null,
          periodEnd: p.periodEnd ? toDbDate(p.periodEnd) : null,
          dueDate: toDbDate(p.dueDate),
          amount: p.amount.toFixed(2),
          description: p.description,
          createdById: actor?.id ?? null,
        })),
      });
    }
    if (plan.cancel.length || plan.create.length) {
      await writeAudit(
        {
          actor,
          action: "charge.sync",
          entityType: "Lease",
          entityId: leaseId,
          metadata: {
            reason,
            created: plan.create.length,
            cancelled: plan.cancel.map((c) => ({
              description: c.description,
              amount: c.amount.toFixed(2),
            })),
          },
        },
        tx,
      );
    }
    return { created: plan.create.length, cancelled: plan.cancel.length };
  });
}

export interface ChargeChangePreview {
  added: { description: string; dueDate: IsoDate; amount: string }[];
  removed: { description: string; dueDate: IsoDate; amount: string }[];
  keptAsIs: {
    description: string;
    dueDate: IsoDate;
    amount: string;
    newAmount: string | null;
    why: string;
  }[];
}

/** What would happen to the charges if the lease were saved with these terms (edit confirmation). */
export async function previewChargeChanges(
  actor: AuditActor,
  leaseId: string,
  input: unknown,
  now = new Date(),
): Promise<ChargeChangePreview> {
  assertCan(actor, "lease.edit");
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const data = parseInput(updateLeaseSchema, input);
  const current = await activeChargesWithPaid(db, leaseId);
  const terms: RentTerms = {
    ...data,
    advanceRentMonths: data.advanceRentMonths ?? null,
    advanceRentAmount: data.advanceRentAmount ?? null,
    escalationPercent: data.escalationPercent ?? null,
    escalationEveryMonths: data.escalationEveryMonths ?? null,
    escalationSteps: data.escalationSteps ?? null,
  };
  const plan = planRegeneration(
    current.map((c) => toExisting(c.charge, c.paid)),
    planCharges(terms),
    manilaToday(now),
  );
  const row = (c: { description: string; dueDate: IsoDate; amount: Money }) => ({
    description: c.description,
    dueDate: c.dueDate,
    amount: c.amount.toFixed(2),
  });
  return {
    added: plan.create.map(row),
    removed: plan.cancel.map(row),
    keptAsIs: plan.keptDifferent.map((k) => ({
      ...row(k.existing),
      newAmount: k.planned ? k.planned.amount.toFixed(2) : null,
      why: k.existing.paid.greaterThan(0) ? "already paid (fully or partly)" : "already due",
    })),
  };
}

const otherChargeSchema = z.object({
  description: requiredText(200, "Describe the charge, e.g. Parking for October."),
  amount: moneySchema({ label: "amount" }),
  dueDate: isoDateSchema("Enter the due date."),
});

/** Add a one-off charge (parking, utilities, repairs…). */
export async function addOtherCharge(
  actor: AuditActor,
  leaseId: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertCan(actor, "payment.record");
  const data = parseInput(otherChargeSchema, input);
  if (!isUuid(leaseId)) throw new NotFoundError("We couldn't find that lease.");
  const lease = await db.lease.findUnique({ where: { id: leaseId } });
  if (!lease || lease.archivedAt) throw new NotFoundError("We couldn't find that lease.");
  return db.$transaction(async (tx) => {
    const c = await tx.charge.create({
      data: {
        leaseId,
        type: "OTHER",
        key: null,
        dueDate: toDbDate(data.dueDate),
        amount: data.amount,
        description: data.description,
        createdById: actor.id,
      },
    });
    await writeAudit(
      {
        actor,
        action: "charge.add",
        entityType: "Lease",
        entityId: leaseId,
        changes: { ...data, chargeId: c.id },
        meta,
      },
      tx,
    );
    return c;
  });
}

/** Void a charge (with a reason). Charges with payments against them must have those payments voided first. */
export async function voidCharge(
  actor: AuditActor,
  chargeId: string,
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
  if (!isUuid(chargeId)) throw new NotFoundError("We couldn't find that charge.");
  const c = await db.charge.findUnique({
    where: { id: chargeId },
    include: { allocations: { where: { payment: { status: "POSTED" } } } },
  });
  if (!c) throw new NotFoundError("We couldn't find that charge.");
  if (c.status !== "ACTIVE") throw new ValidationError("This charge was already removed.");
  if (c.allocations.length) {
    throw new ValidationError(
      "A payment was applied to this charge. Void that payment first, then void the charge.",
    );
  }
  return db.$transaction(async (tx) => {
    const v = await tx.charge.update({
      where: { id: chargeId },
      data: { status: "VOID", statusReason: reason, statusAt: now, statusById: actor.id },
    });
    await writeAudit(
      {
        actor,
        action: "charge.void",
        entityType: "Lease",
        entityId: c.leaseId,
        metadata: { chargeId, description: c.description, amount: c.amount.toFixed(2), reason },
        meta,
      },
      tx,
    );
    return v;
  });
}
