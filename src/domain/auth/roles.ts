/**
 * Roles and permissions. This is the single source of truth for what each role may do;
 * the server checks these on every page, action and API route.
 */

export const ROLES = ["ADMIN", "LEASING_STAFF", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  LEASING_STAFF: "Leasing Staff",
  VIEWER: "Property Management (Viewer)",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Everything Leasing Staff can do, plus users, buildings, settings, audit log and privacy.",
  LEASING_STAFF: "Creates and renews leases, manages tenants, records payments and runs reports.",
  VIEWER: "Read-only view of units, occupancy and lease dates. Sees tenant names only.",
};

export const PERMISSIONS = [
  // Everyone
  "occupancy.view",
  // Leasing work
  "lease.view",
  "lease.edit",
  "tenant.view",
  "tenant.edit",
  "payment.view",
  "payment.record",
  "document.view",
  "document.upload",
  "reminder.handle",
  "report.view",
  "data.export",
  "record.archive",
  // Administration
  "user.manage",
  "property.manage",
  "settings.manage",
  "audit.view",
  "privacy.manage",
  "record.purge",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const LEASING: readonly Permission[] = [
  "occupancy.view",
  "lease.view",
  "lease.edit",
  "tenant.view",
  "tenant.edit",
  "payment.view",
  "payment.record",
  "document.view",
  "document.upload",
  "reminder.handle",
  "report.view",
  "data.export",
  "record.archive",
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set<Permission>([
    ...LEASING,
    "user.manage",
    "property.manage",
    "settings.manage",
    "audit.view",
    "privacy.manage",
    "record.purge",
  ]),
  LEASING_STAFF: new Set<Permission>(LEASING),
  VIEWER: new Set<Permission>(["occupancy.view"]),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** Reminder digests go to active Admin and Leasing Staff users only — never Viewers. */
export function receivesReminders(role: Role): boolean {
  return role === "ADMIN" || role === "LEASING_STAFF";
}
