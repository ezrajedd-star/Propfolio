import { AGING_BUCKETS } from "@/domain/billing/ledger";
import { countOccupancy, unitOccupancy } from "@/domain/leases/occupancy";
import { LEASE_STATUS_LABELS } from "@/domain/leases/status";
import { formatPeso, money } from "@/domain/money/money";
import {
  EXPIRY_WINDOWS,
  REPORTS,
  type ReportColumn,
  type ReportId,
  type ReportResult,
  type ReportValue,
} from "@/domain/reports/definitions";
import { fromDbDate, isIsoDate, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { computeOverdue } from "@/server/billing/balances";
import { PAYMENT_METHOD_LABELS } from "@/server/billing/payments";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { listLeases } from "@/server/leases/service";

export interface ReportFilters {
  buildingId?: string;
  unitTypeId?: string;
  from?: IsoDate;
  to?: IsoDate;
  /** Expiry pipeline: days ahead. */
  days?: number;
}

/** Read filters from URL parameters, ignoring anything invalid. */
export function parseReportFilters(
  sp: URLSearchParams,
  now = new Date(),
): Required<Pick<ReportFilters, "from" | "to" | "days">> & ReportFilters {
  const today = manilaToday(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const days = Number(sp.get("days"));
  const building = sp.get("building") ?? "";
  const unitType = sp.get("unitType") ?? "";
  const f = isIsoDate(from) ? from : monthStart;
  const t = isIsoDate(to) ? to : today;
  return {
    buildingId: isUuid(building) ? building : undefined,
    unitTypeId: isUuid(unitType) ? unitType : undefined,
    from: f <= t ? f : t,
    to: f <= t ? t : f,
    days: (EXPIRY_WINDOWS as readonly number[]).includes(days) ? days : 90,
  };
}

const col = (key: string, label: string, kind: ReportColumn["kind"] = "text"): ReportColumn => ({
  key,
  label,
  kind,
});
const unitWhere = (f: ReportFilters) => ({
  ...(f.buildingId ? { buildingId: f.buildingId } : {}),
  ...(f.unitTypeId ? { unitTypeId: f.unitTypeId } : {}),
});
const sum = (rows: Record<string, ReportValue>[], key: string) =>
  rows.reduce((s, r) => s.plus(r[key] === null ? 0 : String(r[key])), money(0)).toFixed(2);

async function expiry(actor: AuditActor, f: ReportFilters, now: Date): Promise<ReportResult> {
  const days = f.days ?? 90;
  const rows = await listLeases(
    actor,
    { endingWithinDays: days, buildingId: f.buildingId, unitTypeId: f.unitTypeId },
    now,
  );
  const out = rows
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map((r) => ({
      refNo: r.refNo,
      tenant: r.tenant.displayName,
      building: r.building.name,
      unit: r.unit.unitNumber,
      unitType: r.unitType.name,
      endDate: r.terminationDate ?? r.endDate,
      daysLeft: r.daysLeft,
      monthlyRent: r.monthlyRent,
      reminder: r.reminder?.label ?? null,
    }));
  return {
    info: REPORTS.expiry,
    subtitle: `Current leases ending in the next ${days} days`,
    columns: [
      col("refNo", "Lease"),
      col("tenant", "Tenant"),
      col("building", "Building"),
      col("unit", "Unit"),
      col("unitType", "Unit type"),
      col("endDate", "Last day", "date"),
      col("daysLeft", "Days left", "number"),
      col("monthlyRent", "Monthly rent", "money"),
      col("reminder", "Reminder status"),
    ],
    rows: out,
    totals: out.length ? { refNo: "Total", monthlyRent: sum(out, "monthlyRent") } : null,
    highlights: [
      { label: "Leases ending", value: String(out.length) },
      { label: "Monthly rent at stake", value: formatPeso(sum(out, "monthlyRent")) },
    ],
  };
}

async function occupancy(f: ReportFilters, now: Date): Promise<ReportResult> {
  const today = manilaToday(now);
  const buildings = await db.building.findMany({
    where: { archivedAt: null, ...(f.buildingId ? { id: f.buildingId } : {}) },
    orderBy: { name: "asc" },
    include: {
      units: {
        where: { archivedAt: null, ...(f.unitTypeId ? { unitTypeId: f.unitTypeId } : {}) },
        select: {
          statusOverride: true,
          leases: {
            where: {
              archivedAt: null,
              startDate: { lte: toDbDate(today) },
              endDate: { gte: toDbDate(today) },
            },
            select: { startDate: true, endDate: true, terminationDate: true },
          },
        },
      },
    },
  });
  const all: ReturnType<typeof unitOccupancy>[] = [];
  const rows = buildings.map((b) => {
    const values = b.units.map((u) =>
      unitOccupancy(
        u.statusOverride,
        u.leases.map((l) => ({
          startDate: fromDbDate(l.startDate),
          endDate: fromDbDate(l.endDate),
          terminationDate: l.terminationDate ? fromDbDate(l.terminationDate) : null,
        })),
        today,
      ),
    );
    all.push(...values);
    const c = countOccupancy(values);
    return {
      building: b.name,
      total: c.total,
      occupied: c.occupied,
      vacant: c.vacant,
      unavailable: c.unavailable,
      percent: c.occupancyPercent,
    };
  });
  const t = countOccupancy(all);
  return {
    info: REPORTS.occupancy,
    subtitle: `As of ${formatIsoDate(today)}. Occupancy % counts only units that can be leased.`,
    columns: [
      col("building", "Building"),
      col("total", "Units", "number"),
      col("occupied", "Occupied", "number"),
      col("vacant", "Vacant", "number"),
      col("unavailable", "Unavailable or under renovation", "number"),
      col("percent", "Occupancy", "percent"),
    ],
    rows,
    totals: rows.length
      ? {
          building: "Total",
          total: t.total,
          occupied: t.occupied,
          vacant: t.vacant,
          unavailable: t.unavailable,
          percent: t.occupancyPercent,
        }
      : null,
    highlights: [
      { label: "Occupied", value: `${t.occupied} of ${t.occupied + t.vacant} leasable units` },
      { label: "Occupancy", value: `${t.occupancyPercent}%` },
    ],
  };
}

async function rentRoll(actor: AuditActor, f: ReportFilters, now: Date): Promise<ReportResult> {
  const current = (
    await listLeases(actor, { buildingId: f.buildingId, unitTypeId: f.unitTypeId }, now)
  ).filter((r) => r.status === "ACTIVE" || r.status === "EXPIRING");
  const terms = await db.lease.findMany({
    where: { id: { in: current.map((r) => r.id) } },
    select: { id: true, securityDeposit: true },
  });
  const deposit = new Map(terms.map((t) => [t.id, t.securityDeposit.toFixed(2)]));
  const rows = current
    .sort(
      (a, b) =>
        a.building.name.localeCompare(b.building.name) ||
        a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true }),
    )
    .map((r) => ({
      building: r.building.name,
      unit: r.unit.unitNumber,
      unitType: r.unitType.name,
      tenant: r.tenant.displayName,
      refNo: r.refNo,
      startDate: r.startDate,
      endDate: r.terminationDate ?? r.endDate,
      monthlyRent: r.monthlyRent,
      deposit: deposit.get(r.id) ?? null,
      dueDay: r.rentDueDay,
      status: LEASE_STATUS_LABELS[r.status],
    }));
  return {
    info: REPORTS["rent-roll"],
    subtitle: `Active and expiring leases as of ${formatIsoDate(manilaToday(now))}`,
    columns: [
      col("building", "Building"),
      col("unit", "Unit"),
      col("unitType", "Unit type"),
      col("tenant", "Tenant"),
      col("refNo", "Lease"),
      col("startDate", "First day", "date"),
      col("endDate", "Last day", "date"),
      col("monthlyRent", "Monthly rent", "money"),
      col("deposit", "Security deposit", "money"),
      col("dueDay", "Rent due day", "number"),
      col("status", "Status"),
    ],
    rows,
    totals: rows.length
      ? { building: "Total", monthlyRent: sum(rows, "monthlyRent"), deposit: sum(rows, "deposit") }
      : null,
    highlights: [
      { label: "Current leases", value: String(rows.length) },
      { label: "Total monthly rent", value: formatPeso(sum(rows, "monthlyRent")) },
    ],
  };
}

async function collections(f: ReportFilters): Promise<ReportResult> {
  const payments = await db.payment.findMany({
    where: {
      status: "POSTED",
      receivedDate: { gte: toDbDate(f.from!), lte: toDbDate(f.to!) },
      lease: { unit: unitWhere(f) },
    },
    include: {
      lease: {
        select: {
          refNo: true,
          tenant: { select: { displayName: true } },
          unit: { select: { unitNumber: true, building: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ receivedDate: "asc" }, { paymentNo: "asc" }],
    take: 5000,
  });
  const rows = payments.map((p) => ({
    date: fromDbDate(p.receivedDate),
    paymentNo: p.paymentNo,
    tenant: p.lease.tenant.displayName,
    unit: `${p.lease.unit.unitNumber}, ${p.lease.unit.building.name}`,
    refNo: p.lease.refNo,
    method: PAYMENT_METHOD_LABELS[p.method],
    reference: p.reference,
    amount: p.amount.toFixed(2),
  }));
  const byMethod = new Map<string, number>();
  for (const r of rows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + 1);
  return {
    info: REPORTS.collections,
    subtitle: `Payments received ${formatIsoDate(f.from!)} – ${formatIsoDate(f.to!)} (voided payments are left out)`,
    columns: [
      col("date", "Date received", "date"),
      col("paymentNo", "Payment"),
      col("tenant", "Tenant"),
      col("unit", "Unit"),
      col("refNo", "Lease"),
      col("method", "Paid by"),
      col("reference", "Reference"),
      col("amount", "Amount", "money"),
    ],
    rows,
    totals: rows.length ? { date: "Total", amount: sum(rows, "amount") } : null,
    highlights: [
      { label: "Payments", value: String(rows.length) },
      { label: "Total received", value: formatPeso(sum(rows, "amount")) },
    ],
  };
}

async function aging(f: ReportFilters, now: Date): Promise<ReportResult> {
  const report = await computeOverdue(now);
  const byTenant = new Map<string, Record<string, ReportValue>>();
  for (const r of report.rows) {
    if (f.buildingId && r.buildingId !== f.buildingId) continue;
    if (f.unitTypeId && r.unitTypeId !== f.unitTypeId) continue;
    const row = byTenant.get(r.tenantId) ?? {
      tenant: r.tenantName,
      leases: 0,
      oldest: r.oldestDueDate,
      ...Object.fromEntries(AGING_BUCKETS.map((b) => [b, "0.00"])),
      total: "0.00",
    };
    row.leases = Number(row.leases) + 1;
    if (r.oldestDueDate < String(row.oldest)) row.oldest = r.oldestDueDate;
    for (const b of AGING_BUCKETS) row[b] = money(String(row[b])).plus(r.buckets[b]).toFixed(2);
    row.total = money(String(row.total)).plus(r.overdue).toFixed(2);
    byTenant.set(r.tenantId, row);
  }
  const rows = [...byTenant.values()].sort((a, b) =>
    String(a.oldest).localeCompare(String(b.oldest)),
  );
  return {
    info: REPORTS.aging,
    subtitle: `Overdue balances as of ${formatIsoDate(manilaToday(now))}, oldest debt first`,
    columns: [
      col("tenant", "Tenant"),
      col("leases", "Leases", "number"),
      col("oldest", "Oldest due date", "date"),
      ...AGING_BUCKETS.map((b) => col(b, `${b} days`, "money")),
      col("total", "Total overdue", "money"),
    ],
    rows,
    totals: rows.length
      ? {
          tenant: "Total",
          ...Object.fromEntries(AGING_BUCKETS.map((b) => [b, sum(rows, b)])),
          total: sum(rows, "total"),
        }
      : null,
    highlights: [
      { label: "Tenants overdue", value: String(rows.length) },
      { label: "Total overdue", value: formatPeso(sum(rows, "total")) },
    ],
  };
}

const OUTCOME = {
  RENEWED: "Renewed",
  EXPIRED: "Expired, not renewed",
  TERMINATED: "Ended early",
} as const;

async function renewals(actor: AuditActor, f: ReportFilters, now: Date): Promise<ReportResult> {
  const all = await listLeases(actor, { buildingId: f.buildingId, unitTypeId: f.unitTypeId }, now);
  const ended = all.filter((r) => {
    const last = r.terminationDate ?? r.endDate;
    return last >= f.from! && last <= f.to! && r.status in OUTCOME;
  });
  const next = await db.lease.findMany({
    where: { previousLeaseId: { in: ended.map((r) => r.id) } },
    select: { previousLeaseId: true, refNo: true },
  });
  const renewedAs = new Map(next.map((n) => [n.previousLeaseId, n.refNo]));
  const rows = ended
    .sort((a, b) => (a.terminationDate ?? a.endDate).localeCompare(b.terminationDate ?? b.endDate))
    .map((r) => ({
      refNo: r.refNo,
      tenant: r.tenant.displayName,
      unit: `${r.unit.unitNumber}, ${r.building.name}`,
      lastDay: r.terminationDate ?? r.endDate,
      outcome: OUTCOME[r.status as keyof typeof OUTCOME],
      newLease: renewedAs.get(r.id) ?? null,
    }));
  const count = (o: string) => rows.filter((r) => r.outcome === o).length;
  const renewed = count(OUTCOME.RENEWED);
  return {
    info: REPORTS.renewals,
    subtitle: `Leases whose last day was ${formatIsoDate(f.from!)} – ${formatIsoDate(f.to!)}`,
    columns: [
      col("refNo", "Lease"),
      col("tenant", "Tenant"),
      col("unit", "Unit"),
      col("lastDay", "Last day", "date"),
      col("outcome", "What happened"),
      col("newLease", "Renewed as"),
    ],
    rows,
    totals: null,
    highlights: [
      { label: "Renewed", value: String(renewed) },
      { label: "Expired, not renewed", value: String(count(OUTCOME.EXPIRED)) },
      { label: "Ended early", value: String(count(OUTCOME.TERMINATED)) },
      {
        label: "Renewal rate",
        value: rows.length ? `${Math.round((renewed / rows.length) * 1000) / 10}%` : "—",
      },
    ],
  };
}

/** Run a report. Leasing Staff and Admins only; Property Management can't see reports. */
export async function runReport(
  actor: AuditActor,
  id: ReportId,
  filters: ReportFilters,
  now = new Date(),
): Promise<ReportResult> {
  assertCan(actor, "report.view");
  const f = {
    ...filters,
    from: filters.from ?? `${manilaToday(now).slice(0, 8)}01`,
    to: filters.to ?? manilaToday(now),
  };
  switch (id) {
    case "expiry":
      return expiry(actor, f, now);
    case "occupancy":
      return occupancy(f, now);
    case "rent-roll":
      return rentRoll(actor, f, now);
    case "collections":
      return collections(f);
    case "aging":
      return aging(f, now);
    case "renewals":
      return renewals(actor, f, now);
  }
}
