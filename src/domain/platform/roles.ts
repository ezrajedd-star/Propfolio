/**
 * Propfolio staff (platform) roles and what each may do in the operations console. The single
 * source of truth: the server checks these on every console page, action and download. Customer
 * roles (Owner, User Admin, …) never grant anything here.
 */

export const PLATFORM_ROLES = ["PLATFORM_OWNER", "PLATFORM_SUPPORT", "PLATFORM_READONLY"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  PLATFORM_OWNER: "Platform Owner",
  PLATFORM_SUPPORT: "Platform Support",
  PLATFORM_READONLY: "Platform Read-only",
};

export const PLATFORM_ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  PLATFORM_OWNER: "Everything, including billing, staff, agents and the staff log.",
  PLATFORM_SUPPORT:
    "Accounts, tickets and the pipeline. Can't change billing, staff, agents or approvals.",
  PLATFORM_READONLY: "Can look at everything in the console but can't change anything.",
};

export const PLATFORM_PERMISSIONS = [
  "console.view",
  "accounts.view",
  /** Support tools: extend a trial, resend a code, unlock, reset two-step, fix billing name. */
  "accounts.support",
  "pipeline.view",
  "pipeline.manage",
  "tickets.view",
  "tickets.manage",
  "help.manage",
  "approvals.view",
  "approvals.decide",
  "billing.view",
  /** Manual payments, plan changes, suspending and reopening accounts. */
  "billing.manage",
  "agents.view",
  /** Agent on/off, autonomy levels and caps. */
  "agents.manage",
  "health.view",
  "health.manage",
  "staff.manage",
  "stafflog.view",
  "data.export",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const VIEW: PlatformPermission[] = [
  "console.view",
  "accounts.view",
  "pipeline.view",
  "tickets.view",
  "approvals.view",
  "billing.view",
  "agents.view",
  "health.view",
];

const SUPPORT: PlatformPermission[] = [
  ...VIEW,
  "accounts.support",
  "pipeline.manage",
  "tickets.manage",
  "help.manage",
  "health.manage",
  "data.export",
];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  PLATFORM_OWNER: new Set(PLATFORM_PERMISSIONS),
  PLATFORM_SUPPORT: new Set(SUPPORT),
  PLATFORM_READONLY: new Set(VIEW),
};

export function platformCan(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role].has(permission);
}

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

/**
 * Whether a staff change would leave the console without an active Platform Owner, or have
 * someone demote or turn off themselves. Returns a plain reason, or null when the change is fine.
 */
export function staffChangeProblem(input: {
  actorId: string;
  targetId: string;
  targetRole: PlatformRole;
  targetActive: boolean;
  next: { role?: PlatformRole; isActive?: boolean };
  activeOwners: number;
}): string | null {
  const { actorId, targetId, targetRole, targetActive, next, activeOwners } = input;
  const demoting = next.role !== undefined && next.role !== targetRole;
  const deactivating = next.isActive === false && targetActive;
  if (actorId === targetId && (demoting || deactivating)) {
    return "You can't change your own role or turn yourself off. Ask another Platform Owner.";
  }
  const losesOwner =
    targetRole === "PLATFORM_OWNER" &&
    targetActive &&
    (deactivating || (demoting && next.role !== "PLATFORM_OWNER"));
  if (losesOwner && activeOwners <= 1) {
    return "This is the only active Platform Owner. Make someone else an Owner first.";
  }
  return null;
}
