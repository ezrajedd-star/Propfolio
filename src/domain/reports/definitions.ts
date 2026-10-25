/** The six reports (brief §5.9): what they are called, how they are filtered and their columns. */

export const REPORT_IDS = [
  "expiry",
  "occupancy",
  "rent-roll",
  "collections",
  "aging",
  "renewals",
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export type ColumnKind = "text" | "date" | "money" | "number" | "percent";
export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
}

export interface ReportInfo {
  id: ReportId;
  title: string;
  description: string;
  /** Which filters the report uses besides building and unit type. */
  uses: { dateRange: boolean; window: boolean };
}

export const REPORTS: Record<ReportId, ReportInfo> = {
  expiry: {
    id: "expiry",
    title: "Expiry pipeline",
    description: "Current leases ending in the next 30, 60, 90 or 180 days.",
    uses: { dateRange: false, window: true },
  },
  occupancy: {
    id: "occupancy",
    title: "Occupancy",
    description: "Occupied, vacant and unavailable units by building, today.",
    uses: { dateRange: false, window: false },
  },
  "rent-roll": {
    id: "rent-roll",
    title: "Rent roll",
    description: "Every current lease with its rent, deposit and term.",
    uses: { dateRange: false, window: false },
  },
  collections: {
    id: "collections",
    title: "Collections",
    description: "Payments received in a period.",
    uses: { dateRange: true, window: false },
  },
  aging: {
    id: "aging",
    title: "Overdue aging",
    description: "What each tenant owes past the due date, by how late it is.",
    uses: { dateRange: false, window: false },
  },
  renewals: {
    id: "renewals",
    title: "Renewal history",
    description: "Leases that ended in a period: renewed, expired or ended early.",
    uses: { dateRange: true, window: false },
  },
};

export const EXPIRY_WINDOWS = [30, 60, 90, 180] as const;

export function isReportId(v: string): v is ReportId {
  return (REPORT_IDS as readonly string[]).includes(v);
}

export type ReportValue = string | number | null;

export interface ReportResult {
  info: ReportInfo;
  /** Plain-language summary of the filters, e.g. "Payments received 1 Oct 2026 – 25 Oct 2026". */
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, ReportValue>[];
  /** Optional totals row (same keys as columns). */
  totals: Record<string, ReportValue> | null;
  /** Short highlights shown above the table, e.g. "Renewed: 4". */
  highlights: { label: string; value: string }[];
}
