import type { Prisma } from "@prisma/client";

import { computeLeaseStatus, type LeaseStatus } from "@/domain/leases/status";
import {
  effectiveReminderConfig,
  expiringWindowDays,
  parseStoredReminderConfig,
  type ReminderConfig,
  type ReminderSource,
} from "@/domain/reminders/config";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";

/** What a lease query must include to compute its status. */
export const leaseStatusInclude = {
  unit: { select: { reminderConfig: true, unitType: { select: { reminderConfig: true } } } },
  nextLease: { select: { id: true, archivedAt: true } },
} satisfies Prisma.LeaseInclude;

export interface UnitReminderSource {
  reminderConfig: Prisma.JsonValue;
  unitType: { reminderConfig: Prisma.JsonValue };
}

export function unitReminderConfig(
  system: ReminderConfig,
  unit: UnitReminderSource,
): { config: ReminderConfig; source: ReminderSource } {
  return effectiveReminderConfig(
    system,
    parseStoredReminderConfig(unit.unitType.reminderConfig),
    parseStoredReminderConfig(unit.reminderConfig),
  );
}

export interface LeaseForStatus {
  startDate: Date;
  endDate: Date;
  terminationDate: Date | null;
  unit: UnitReminderSource;
  nextLease: { id: string; archivedAt: Date | null } | null;
}

export function leaseDatesOf(lease: Omit<LeaseForStatus, "unit">) {
  return {
    startDate: fromDbDate(lease.startDate),
    endDate: fromDbDate(lease.endDate),
    terminationDate: lease.terminationDate ? fromDbDate(lease.terminationDate) : null,
    renewed: lease.nextLease !== null && lease.nextLease.archivedAt === null,
  };
}

/** The lease's status today, computed from its dates, actions and its unit's reminder window. */
export function statusOf(
  lease: LeaseForStatus,
  system: ReminderConfig,
  today: IsoDate,
): LeaseStatus {
  const { config } = unitReminderConfig(system, lease.unit);
  return computeLeaseStatus(leaseDatesOf(lease), today, expiringWindowDays(config));
}
