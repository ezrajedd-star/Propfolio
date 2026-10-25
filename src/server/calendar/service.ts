import { z } from "zod";

import { can } from "@/domain/auth/roles";
import {
  CALENDAR_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  VIEWER_EVENT_TYPES,
  leaseEvents,
  type CalendarEventType,
} from "@/domain/calendar/events";
import { LEASE_STATUSES, timeLeftText, type LeaseStatus } from "@/domain/leases/status";
import {
  addDays,
  daysBetween,
  isIsoDate,
  toDbDate,
  type IsoDate,
} from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { isUuid } from "@/server/db-errors";
import { ValidationError } from "@/server/errors";
import { getSettings } from "@/server/settings/service";
import {
  leaseDatesOf,
  leaseStatusInclude,
  statusOf,
  unitReminderConfig,
} from "@/server/leases/status-context";

const MAX_RANGE_DAYS = 400;

export const calendarQuerySchema = z.object({
  from: z.string().refine(isIsoDate, "Invalid start date."),
  to: z.string().refine(isIsoDate, "Invalid end date."),
  buildingId: z.string().optional(),
  unitTypeId: z.string().optional(),
  status: z.enum(LEASE_STATUSES).optional(),
  /** Comma-separated event types; defaults to everything except rent due dates. */
  types: z.string().optional(),
});

/**
 * One calendar event, as sent to the browser. Viewers (Property Management) get lease start and
 * end dates with the tenant's display name only: no reference, money or lease id.
 */
export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  typeLabel: string;
  date: IsoDate;
  status: LeaseStatus;
  tenantName: string;
  unitLabel: string;
  buildingName: string;
  startDate: IsoDate;
  endDate: IsoDate;
  daysBefore?: number;
  /** Leasing staff only. */
  lease?: { id: string; refNo: string; monthlyRent: string; timeLeft: string; canRenew: boolean };
}

export async function getCalendarEvents(
  actor: AuditActor,
  query: unknown,
  now = new Date(),
): Promise<CalendarEvent[]> {
  assertCan(actor, "occupancy.view");
  const parsed = calendarQuerySchema.safeParse(query);
  if (!parsed.success) throw new ValidationError("That date range isn't valid.");
  const q = parsed.data;
  if (q.to < q.from || daysBetween(q.from, q.to) > MAX_RANGE_DAYS) {
    throw new ValidationError(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
  }
  const staff = can(actor.role, "lease.view");
  const requested = (q.types ? q.types.split(",") : ["END", "START", "REMINDER"]).filter(
    (t): t is CalendarEventType => (CALENDAR_EVENT_TYPES as readonly string[]).includes(t),
  );
  const types = staff ? requested : requested.filter((t) => VIEWER_EVENT_TYPES.includes(t));
  if (types.length === 0) return [];

  const today = manilaToday(now);
  const [leases, settings] = await Promise.all([
    db.lease.findMany({
      where: {
        archivedAt: null,
        // Every event (start, end, reminders, rent due) falls within the lease's own dates.
        startDate: { lte: toDbDate(q.to) },
        endDate: { gte: toDbDate(addDays(q.from, -1)) },
        unit: {
          ...(q.buildingId && isUuid(q.buildingId) ? { buildingId: q.buildingId } : {}),
          ...(q.unitTypeId && isUuid(q.unitTypeId) ? { unitTypeId: q.unitTypeId } : {}),
        },
      },
      include: {
        ...leaseStatusInclude,
        unit: {
          select: {
            unitNumber: true,
            reminderConfig: true,
            building: { select: { name: true } },
            unitType: { select: { reminderConfig: true } },
          },
        },
        tenant: { select: { displayName: true } },
      },
    }),
    getSettings(),
  ]);
  const out: CalendarEvent[] = [];
  for (const l of leases) {
    const status = statusOf(l, settings.reminderDefaults, today);
    if (q.status && status !== q.status) continue;
    const dates = leaseDatesOf(l);
    const reminderConfig = unitReminderConfig(settings.reminderDefaults, l.unit).config;
    const core = leaseEvents(
      { id: l.id, ...dates, status, rentDueDay: l.rentDueDay, reminderConfig },
      q.from,
      q.to,
      types,
    );
    for (const e of core) {
      out.push({
        id: e.id,
        type: e.type,
        typeLabel: EVENT_TYPE_LABELS[e.type],
        date: e.date,
        status,
        tenantName: l.tenant.displayName,
        unitLabel: `Unit ${l.unit.unitNumber}`,
        buildingName: l.unit.building.name,
        startDate: dates.startDate,
        endDate: dates.terminationDate ?? dates.endDate,
        ...(e.daysBefore !== undefined ? { daysBefore: e.daysBefore } : {}),
        ...(staff
          ? {
              lease: {
                id: l.id,
                refNo: l.refNo,
                monthlyRent: l.monthlyRent.toFixed(2),
                timeLeft: timeLeftText(dates, today),
                canRenew: can(actor.role, "lease.edit") && !dates.terminationDate && !dates.renewed,
              },
            }
          : {}),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}
