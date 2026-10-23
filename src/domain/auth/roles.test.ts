import { describe, expect, it } from "vitest";

import { PERMISSIONS, can, receivesReminders, type Permission, type Role } from "./roles";

const ADMIN_ONLY: Permission[] = [
  "user.manage",
  "property.manage",
  "settings.manage",
  "audit.view",
  "privacy.manage",
  "record.purge",
];

describe("role permissions", () => {
  it.each(PERMISSIONS)("Admin can %s", (p) => {
    expect(can("ADMIN", p)).toBe(true);
  });

  it.each(PERMISSIONS)("Viewer can only view occupancy (%s)", (p) => {
    expect(can("VIEWER", p)).toBe(p === "occupancy.view");
  });

  it.each(PERMISSIONS)("Leasing Staff: %s", (p) => {
    expect(can("LEASING_STAFF", p)).toBe(!ADMIN_ONLY.includes(p));
  });

  it("Viewers never see tenant contact, financial or document data", () => {
    for (const p of ["tenant.view", "payment.view", "document.view", "lease.view"] as const) {
      expect(can("VIEWER", p)).toBe(false);
    }
  });

  it.each<[Role, boolean]>([
    ["ADMIN", true],
    ["LEASING_STAFF", true],
    ["VIEWER", false],
  ])("reminders go to %s: %s", (role, expected) => {
    expect(receivesReminders(role)).toBe(expected);
  });
});
