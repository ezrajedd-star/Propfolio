/**
 * Columns of the leases grid. People can show, hide and reorder them; their layout is saved per
 * user. Unknown or missing columns in a saved layout are repaired, so adding a column later
 * never breaks someone's saved layout.
 */
export const GRID_COLUMNS = [
  { id: "refNo", label: "Ref No.", defaultVisible: true, required: true },
  { id: "building", label: "Building", defaultVisible: true },
  { id: "unit", label: "Unit", defaultVisible: true },
  { id: "unitType", label: "Unit type", defaultVisible: false },
  { id: "tenant", label: "Tenant", defaultVisible: true },
  { id: "contactPerson", label: "Contact person", defaultVisible: false },
  { id: "startDate", label: "Start", defaultVisible: true },
  { id: "endDate", label: "End", defaultVisible: true },
  { id: "daysLeft", label: "Days left", defaultVisible: true },
  { id: "monthlyRent", label: "Monthly rent", defaultVisible: true },
  { id: "rentDueDay", label: "Rent due day", defaultVisible: false },
  { id: "balanceDue", label: "Balance due", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "reminderStatus", label: "Reminder status", defaultVisible: true },
  { id: "remarks", label: "Remarks", defaultVisible: true },
] as const;

export type GridColumnId = (typeof GRID_COLUMNS)[number]["id"];

export const GRID_COLUMN_IDS: GridColumnId[] = GRID_COLUMNS.map((c) => c.id);

export interface GridLayout {
  order: GridColumnId[];
  hidden: GridColumnId[];
  groupByBuilding: boolean;
}

export const DEFAULT_GRID_LAYOUT: GridLayout = {
  order: [...GRID_COLUMN_IDS],
  hidden: GRID_COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.id),
  groupByBuilding: false,
};

const isColumn = (v: unknown): v is GridColumnId =>
  typeof v === "string" && (GRID_COLUMN_IDS as string[]).includes(v);

/** Repair a saved layout: drop unknown ids, append new columns, never hide required ones. */
export function normalizeGridLayout(value: unknown): GridLayout {
  if (!value || typeof value !== "object") return DEFAULT_GRID_LAYOUT;
  const v = value as Partial<Record<keyof GridLayout, unknown>>;
  const order = Array.isArray(v.order) ? [...new Set(v.order.filter(isColumn))] : [];
  for (const id of GRID_COLUMN_IDS) if (!order.includes(id)) order.push(id);
  const required = GRID_COLUMNS.filter((c) => "required" in c && c.required).map(
    (c) => c.id as GridColumnId,
  );
  const hidden = Array.isArray(v.hidden)
    ? [...new Set(v.hidden.filter(isColumn))].filter((id) => !required.includes(id))
    : DEFAULT_GRID_LAYOUT.hidden;
  return { order, hidden, groupByBuilding: v.groupByBuilding === true };
}

/** Move a column one step left (-1) or right (+1). */
export function moveColumn(
  order: GridColumnId[],
  id: GridColumnId,
  direction: -1 | 1,
): GridColumnId[] {
  const i = order.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
