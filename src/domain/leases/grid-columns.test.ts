import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRID_LAYOUT,
  GRID_COLUMN_IDS,
  moveColumn,
  normalizeGridLayout,
} from "./grid-columns";

describe("grid layout", () => {
  it.each([null, "x", 42, {}])("falls back to the default for %j", (v) => {
    expect(normalizeGridLayout(v).order).toEqual(GRID_COLUMN_IDS);
  });

  it("drops unknown columns, de-duplicates and appends new ones", () => {
    const l = normalizeGridLayout({
      order: ["tenant", "bogus", "tenant", "refNo"],
      hidden: ["remarks", "bogus"],
      groupByBuilding: true,
    });
    expect(l.order.slice(0, 2)).toEqual(["tenant", "refNo"]);
    expect(l.order).toHaveLength(GRID_COLUMN_IDS.length);
    expect(l.hidden).toEqual(["remarks"]);
    expect(l.groupByBuilding).toBe(true);
  });

  it("never hides the reference number", () => {
    expect(normalizeGridLayout({ order: [], hidden: ["refNo", "unit"] }).hidden).toEqual(["unit"]);
  });

  it("moves columns within bounds", () => {
    const order = DEFAULT_GRID_LAYOUT.order;
    expect(moveColumn(order, "building", -1).slice(0, 2)).toEqual(["building", "refNo"]);
    expect(moveColumn(order, "refNo", -1)).toBe(order);
    expect(moveColumn(order, "remarks", 1)).toBe(order);
  });
});
