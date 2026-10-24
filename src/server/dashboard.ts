import { can } from "@/domain/auth/roles";
import type { LeaseStatus } from "@/domain/leases/status";
import { addDays } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { listLeases, type LeaseRow } from "@/server/leases/service";
import { listBuildings, type BuildingSummary } from "@/server/property/buildings";

export interface Dashboard {
  buildings: BuildingSummary[];
  /** Leasing staff only. */
  leases?: {
    active: number;
    expiringIn90: number;
    expiredNotRenewed: number;
    upcomingExpiries: LeaseRow[];
    expiringSoon: LeaseRow[];
  };
}

const LIVE: LeaseStatus[] = ["ACTIVE", "EXPIRING"];

export async function getDashboard(actor: AuditActor, now = new Date()): Promise<Dashboard> {
  assertCan(actor, "occupancy.view");
  const buildings = await listBuildings(actor, {}, now);
  if (!can(actor.role, "lease.view")) return { buildings };

  const today = manilaToday(now);
  const in90 = addDays(today, 90);
  const leases = await listLeases(actor, {}, now);
  const live = leases.filter((l) => LIVE.includes(l.status));
  const upcoming = live
    .filter((l) => (l.terminationDate ?? l.endDate) <= in90)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return {
    buildings,
    leases: {
      active: live.length,
      expiringIn90: upcoming.length,
      expiredNotRenewed: leases.filter((l) => l.status === "EXPIRED").length,
      upcomingExpiries: upcoming.slice(0, 8),
      expiringSoon: upcoming.filter((l) => l.daysLeft <= 30),
    },
  };
}
