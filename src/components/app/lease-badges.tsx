import {
  Ban,
  CalendarClock,
  CircleCheck,
  CircleSlash,
  Clock,
  Hammer,
  Home,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { OCCUPANCY_LABELS, OCCUPANCY_TONES, type Occupancy } from "@/domain/leases/occupancy";
import { LEASE_STATUS_LABELS, LEASE_STATUS_TONES, type LeaseStatus } from "@/domain/leases/status";
import { StatusBadge } from "./status-badge";

const STATUS_ICONS = {
  UPCOMING: CalendarClock,
  ACTIVE: CircleCheck,
  EXPIRING: Clock,
  EXPIRED: TriangleAlert,
  RENEWED: RefreshCw,
  TERMINATED: Ban,
} as const;

export function LeaseStatusBadge({ status }: { status: LeaseStatus }) {
  return (
    <StatusBadge
      tone={LEASE_STATUS_TONES[status]}
      label={LEASE_STATUS_LABELS[status]}
      icon={STATUS_ICONS[status]}
    />
  );
}

const OCCUPANCY_ICONS = {
  OCCUPIED: Home,
  VACANT: CircleSlash,
  UNDER_RENOVATION: Hammer,
  UNAVAILABLE: Ban,
} as const;

export function OccupancyBadge({ occupancy }: { occupancy: Occupancy }) {
  return (
    <StatusBadge
      tone={OCCUPANCY_TONES[occupancy]}
      label={OCCUPANCY_LABELS[occupancy]}
      icon={OCCUPANCY_ICONS[occupancy]}
    />
  );
}
