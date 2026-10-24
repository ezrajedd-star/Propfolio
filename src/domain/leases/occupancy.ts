import type { IsoDate } from "../time/calendar-date";
import { leaseCovers, type LeaseDates } from "./status";

export const UNIT_STATUS_OVERRIDES = ["UNDER_RENOVATION", "UNAVAILABLE"] as const;
export type UnitStatusOverride = (typeof UNIT_STATUS_OVERRIDES)[number];

export type Occupancy = "OCCUPIED" | "VACANT" | UnitStatusOverride;

export const OCCUPANCY_LABELS: Record<Occupancy, string> = {
  OCCUPIED: "Occupied",
  VACANT: "Vacant",
  UNDER_RENOVATION: "Under renovation",
  UNAVAILABLE: "Unavailable",
};

export const OCCUPANCY_TONES: Record<Occupancy, "success" | "default" | "warning" | "neutral"> = {
  OCCUPIED: "success",
  VACANT: "default",
  UNDER_RENOVATION: "warning",
  UNAVAILABLE: "neutral",
};

/**
 * OCCUPIED if any lease covers today; otherwise the manual override if one is set; otherwise
 * VACANT. (Brief §4: an active lease always means occupied.)
 */
export function unitOccupancy(
  override: UnitStatusOverride | null,
  leases: Pick<LeaseDates, "startDate" | "endDate" | "terminationDate">[],
  today: IsoDate,
): Occupancy {
  if (leases.some((l) => leaseCovers(l, today))) return "OCCUPIED";
  return override ?? "VACANT";
}

export interface OccupancyCounts {
  occupied: number;
  vacant: number;
  unavailable: number;
  total: number;
  /** Occupied as a share of units that can be leased (excludes unavailable/renovation), 0–100. */
  occupancyPercent: number;
}

export function countOccupancy(values: Occupancy[]): OccupancyCounts {
  const occupied = values.filter((v) => v === "OCCUPIED").length;
  const vacant = values.filter((v) => v === "VACANT").length;
  const unavailable = values.length - occupied - vacant;
  const leasable = occupied + vacant;
  return {
    occupied,
    vacant,
    unavailable,
    total: values.length,
    occupancyPercent: leasable === 0 ? 0 : Math.round((occupied / leasable) * 1000) / 10,
  };
}
