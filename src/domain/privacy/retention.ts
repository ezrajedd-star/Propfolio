import { addMonths, type IsoDate } from "../time/calendar-date";

export interface RetentionInput {
  /** Last day of each of the tenant's leases (termination date if ended early). */
  leaseEndDates: IsoDate[];
  /** True if any lease is still current or starts in the future. */
  hasLiveLease: boolean;
  /** Day the tenant was archived (Manila date), if archived. */
  archivedOn: IsoDate | null;
  /** Day the tenant was added (Manila date); used when there are no leases. */
  createdOn: IsoDate;
}

/**
 * When a tenant's personal data is due for anonymisation (decision 8): the retention period
 * runs from the end of their last lease, or from archiving if that was later. Tenants with a
 * current or future lease are never due.
 */
export function retentionDueDate(t: RetentionInput, years: number): IsoDate | null {
  if (t.hasLiveLease) return null;
  const candidates = [...t.leaseEndDates, ...(t.archivedOn ? [t.archivedOn] : [])];
  if (candidates.length === 0) candidates.push(t.createdOn);
  const from = candidates.reduce((a, b) => (a > b ? a : b));
  return addMonths(from, years * 12);
}

export function isPastRetention(t: RetentionInput, years: number, today: IsoDate): boolean {
  const due = retentionDueDate(t, years);
  return due !== null && due < today;
}

/** Placeholder name for an anonymised tenant, e.g. "Anonymised tenant 3F9A21". */
export function anonymisedName(tenantId: string): string {
  return `Anonymised tenant ${tenantId.replace(/-/g, "").slice(-6).toUpperCase()}`;
}
