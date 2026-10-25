import {
  AGING_BUCKETS,
  balanceDue,
  summariseOverdue,
  type AgingBucket,
} from "@/domain/billing/ledger";
import { money, type Money } from "@/domain/money/money";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";

/**
 * The single place overdue amounts and balances are worked out. The dashboard, the leases grid,
 * the lease page, the overdue list and the reminder email all use this, so their totals always
 * agree. Archived leases are left out.
 */
async function loadOpenCharges(leaseIds?: string[]) {
  const charges = await db.charge.findMany({
    where: {
      status: "ACTIVE",
      lease: { archivedAt: null },
      ...(leaseIds ? { leaseId: { in: leaseIds } } : {}),
    },
    select: {
      leaseId: true,
      dueDate: true,
      amount: true,
      allocations: { where: { payment: { status: "POSTED" } }, select: { amount: true } },
    },
  });
  const byLease = new Map<string, { dueDate: IsoDate; amount: Money; paid: Money }[]>();
  for (const c of charges) {
    const list = byLease.get(c.leaseId) ?? [];
    list.push({
      dueDate: fromDbDate(c.dueDate),
      amount: money(c.amount.toString()),
      paid: c.allocations.reduce((s, a) => s.plus(a.amount.toString()), money(0)),
    });
    byLease.set(c.leaseId, list);
  }
  return byLease;
}

export interface LeaseBalance {
  balanceDue: string;
  overdue: string;
}

/** Balance due now and overdue amount for each lease (leases grid). */
export async function balancesForLeases(
  leaseIds: string[],
  now = new Date(),
): Promise<Map<string, LeaseBalance>> {
  const today = manilaToday(now);
  const byLease = await loadOpenCharges(leaseIds);
  return new Map(
    leaseIds.map((id) => {
      const charges = byLease.get(id) ?? [];
      return [
        id,
        {
          balanceDue: balanceDue(charges, today).toFixed(2),
          overdue: summariseOverdue(charges, today).total.toFixed(2),
        },
      ];
    }),
  );
}

export interface OverdueRow {
  leaseId: string;
  refNo: string;
  tenantId: string;
  tenantName: string;
  unitLabel: string;
  buildingId: string;
  buildingName: string;
  unitTypeId: string;
  overdue: string;
  count: number;
  oldestDueDate: IsoDate;
  bucket: AgingBucket;
  buckets: Record<AgingBucket, string>;
}

export interface OverdueReport {
  rows: OverdueRow[];
  total: string;
  count: number;
  buckets: Record<AgingBucket, string>;
}

/** Every lease with overdue charges, oldest debt first, plus totals by aging bucket. */
export async function overdueReport(actor: AuditActor, now = new Date()): Promise<OverdueReport> {
  assertCan(actor, "payment.view");
  return computeOverdue(now);
}

/** System use only (the daily email); people go through `overdueReport`. */
export async function computeOverdue(now = new Date()): Promise<OverdueReport> {
  const today = manilaToday(now);
  const byLease = await loadOpenCharges();
  const leases = await db.lease.findMany({
    where: { id: { in: [...byLease.keys()] } },
    select: {
      id: true,
      refNo: true,
      tenant: { select: { id: true, displayName: true } },
      unit: {
        select: {
          unitNumber: true,
          unitTypeId: true,
          building: { select: { id: true, name: true } },
        },
      },
    },
  });
  const info = new Map(leases.map((l) => [l.id, l]));
  const rows: OverdueRow[] = [];
  let total = money(0);
  let count = 0;
  const totals = Object.fromEntries(AGING_BUCKETS.map((b) => [b, money(0)])) as Record<
    AgingBucket,
    Money
  >;
  for (const [leaseId, charges] of byLease) {
    const s = summariseOverdue(charges, today);
    if (s.count === 0) continue;
    const l = info.get(leaseId)!;
    const worst = [...AGING_BUCKETS].reverse().find((b) => s.buckets[b].greaterThan(0))!;
    rows.push({
      leaseId,
      refNo: l.refNo,
      tenantId: l.tenant.id,
      tenantName: l.tenant.displayName,
      unitLabel: `Unit ${l.unit.unitNumber}, ${l.unit.building.name}`,
      buildingId: l.unit.building.id,
      buildingName: l.unit.building.name,
      unitTypeId: l.unit.unitTypeId,
      overdue: s.total.toFixed(2),
      count: s.count,
      oldestDueDate: s.oldestDueDate!,
      bucket: worst,
      buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, s.buckets[b].toFixed(2)])) as Record<
        AgingBucket,
        string
      >,
    });
    total = total.plus(s.total);
    count += s.count;
    for (const b of AGING_BUCKETS) totals[b] = totals[b].plus(s.buckets[b]);
  }
  rows.sort(
    (a, b) =>
      a.oldestDueDate.localeCompare(b.oldestDueDate) || Number(b.overdue) - Number(a.overdue),
  );
  return {
    rows,
    total: total.toFixed(2),
    count,
    buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, totals[b].toFixed(2)])) as Record<
      AgingBucket,
      string
    >,
  };
}
