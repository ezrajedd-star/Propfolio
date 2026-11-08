/**
 * Plans, limits and the trial. This is the ONE place prices, limits and the trial length live
 * (brief: "keep prices, plan limits and trial length in one configuration place"). The server
 * checks what a plan allows together with the person's role, on every page, action and API route.
 */
import type { Permission } from "@/domain/auth/roles";
import { manilaToday } from "@/domain/time/manila";

export const PLANS = ["FREE", "PRO", "PREMIUM"] as const;
export type PlanName = (typeof PLANS)[number];

export interface PlanConfig {
  label: string;
  /** Pesos per month, as a decimal string (money is never a float). */
  pricePerMonth: string;
  /** Active (not archived) units the account may have. */
  units: number;
  /** People who can sign in, the Owner included. */
  users: number;
}

export const PLAN_CONFIG: Record<PlanName, PlanConfig> = {
  FREE: { label: "Free", pricePerMonth: "0.00", units: 3, users: 1 },
  PRO: { label: "Pro", pricePerMonth: "1500.00", units: 50, users: 1 },
  PREMIUM: { label: "Premium", pricePerMonth: "3500.00", units: 200, users: 5 },
};

/** New accounts get Premium free for this many days. */
export const TRIAL_DAYS = 30;
/** Trial reminder emails go out this many days before the trial ends. */
export const TRIAL_REMINDER_DAYS = [7, 1] as const;

/** Features that need a paid plan. Each plan includes everything below it. */
export const FEATURES = [
  "payments",
  "reports",
  "customReminders",
  "team",
  "documents",
  "auditLog",
] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_PLAN: Record<Feature, PlanName> = {
  payments: "PRO",
  reports: "PRO",
  customReminders: "PRO",
  team: "PREMIUM",
  documents: "PREMIUM",
  auditLog: "PREMIUM",
};

export const FEATURE_LABELS: Record<Feature, string> = {
  payments: "Payments, overdue list and acknowledgements",
  reports: "Reports",
  customReminders: "Your own reminder lead times",
  team: "More than one user, with roles",
  documents: "Document storage",
  auditLog: "Audit log",
};

/** Permissions that belong to a paid feature. Anything not listed is on every plan. */
const PERMISSION_FEATURE: Partial<Record<Permission, Feature>> = {
  "payment.view": "payments",
  "payment.record": "payments",
  "report.view": "reports",
  "user.manage": "team",
  // Viewing documents stays on every plan: after a downgrade, existing files stay viewable.
  "document.upload": "documents",
  "audit.view": "auditLog",
};

/**
 * Permissions that still work while the account is read-only (over its unit limit): looking,
 * exporting and the privacy tools. Everything else changes data and is refused.
 */
const READ_ONLY_ALLOWED: ReadonlySet<Permission> = new Set<Permission>([
  "occupancy.view",
  "lease.view",
  "tenant.view",
  "payment.view",
  "document.view",
  "report.view",
  "data.export",
  "audit.view",
  "privacy.manage",
  // Upgrading is how a read-only account gets going again.
  "billing.manage",
]);

const RANK: Record<PlanName, number> = { FREE: 0, PRO: 1, PREMIUM: 2 };

export function planIncludes(plan: PlanName, feature: Feature): boolean {
  return RANK[plan] >= RANK[FEATURE_PLAN[feature]];
}

export function featureForPermission(permission: Permission): Feature | undefined {
  return PERMISSION_FEATURE[permission];
}

/** The account's stored plan facts. `paidUntil` is a Manila date, inclusive. */
export interface AccountPlanFacts {
  plan: PlanName;
  trialEndsAt: Date | null;
  paidUntil: string | null;
}

export interface EffectivePlan {
  plan: PlanName;
  /** What the account chose (or was given); differs from `plan` after a trial or payment ends. */
  storedPlan: PlanName;
  /** Set while a free Premium trial is running. */
  trial: { endsAt: Date; daysLeft: number } | null;
  /** True when a trial or paid period has ended and the account fell back to Free. */
  lapsed: boolean;
}

export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}

/**
 * The plan an account is on right now.
 * - A running trial gives Premium.
 * - Otherwise a paid period (`paidUntil` today or later) gives the stored plan.
 * - If a trial or paid period was set and has ended, the account is on Free (nothing is deleted).
 * - With neither date set, the stored plan applies with no end date (the first customer, and
 *   accounts the platform admin set by hand).
 */
export function effectivePlan(facts: AccountPlanFacts, now: Date): EffectivePlan {
  const trialRunning = facts.trialEndsAt !== null && facts.trialEndsAt.getTime() > now.getTime();
  const trial = trialRunning
    ? { endsAt: facts.trialEndsAt!, daysLeft: trialDaysLeft(facts.trialEndsAt!, now) }
    : null;
  const paid = facts.paidUntil !== null && facts.paidUntil >= manilaToday(now);
  const base = { storedPlan: facts.plan, trial };

  if (trialRunning) {
    // Someone already paying for Premium isn't shown a trial countdown.
    const paidPremium = paid && facts.plan === "PREMIUM";
    return { ...base, plan: "PREMIUM", trial: paidPremium ? null : trial, lapsed: false };
  }
  if (paid) return { ...base, plan: facts.plan, lapsed: false };
  if (facts.trialEndsAt === null && facts.paidUntil === null) {
    return { ...base, plan: facts.plan, lapsed: false };
  }
  // A trial or paid period was set and has ended.
  return { ...base, plan: "FREE", lapsed: true };
}

/** Everything the server needs to decide what an account may do right now. */
export interface PlanAccess extends EffectivePlan {
  units: { used: number; limit: number };
  users: { limit: number };
  /** Over the unit limit: no adding or editing until it upgrades or archives units. */
  readOnly: boolean;
}

export function planAccess(facts: AccountPlanFacts, activeUnits: number, now: Date): PlanAccess {
  const effective = effectivePlan(facts, now);
  const config = PLAN_CONFIG[effective.plan];
  return {
    ...effective,
    units: { used: activeUnits, limit: config.units },
    users: { limit: config.users },
    readOnly: activeUnits > config.units,
  };
}

export type PlanDenial =
  { reason: "feature"; feature: Feature; plan: PlanName } | { reason: "readOnly" };

/** Why the plan refuses this permission, or null if it allows it. Roles are checked separately. */
export function planDenial(
  access: Pick<PlanAccess, "plan" | "readOnly">,
  permission: Permission,
  options: { duringReadOnly?: boolean } = {},
): PlanDenial | null {
  const feature = featureForPermission(permission);
  if (feature && !planIncludes(access.plan, feature)) {
    return { reason: "feature", feature, plan: FEATURE_PLAN[feature] };
  }
  if (access.readOnly && !options.duringReadOnly && !READ_ONLY_ALLOWED.has(permission)) {
    return { reason: "readOnly" };
  }
  return null;
}

/** Can the account add one more unit? Archived units don't count. */
export function canAddUnits(access: Pick<PlanAccess, "units">, adding = 1): boolean {
  return access.units.used + adding <= access.units.limit;
}

/**
 * Who may sign in under the plan's user limit: the Owner always, plus the longest-standing other
 * active members up to the limit. Others are suspended (not deleted) until the account upgrades.
 * `earlierActiveOthers` counts active non-Owner members who joined before this person.
 */
export function withinUserLimit(
  plan: PlanName,
  role: string,
  earlierActiveOthers: number,
): boolean {
  if (role === "OWNER") return true;
  return earlierActiveOthers < PLAN_CONFIG[plan].users - 1;
}

/** The plan that unlocks a feature, as people read it: "Available on Pro". */
export function availableOnMessage(feature: Feature): string {
  return `Available on ${PLAN_CONFIG[FEATURE_PLAN[feature]].label}`;
}

export const READ_ONLY_MESSAGE =
  "Your account has more units than your plan includes, so it is read-only for now. " +
  "Upgrade, or archive units to get back within the limit.";

export function unitLimitMessage(plan: PlanName): string {
  const { units, label } = PLAN_CONFIG[plan];
  return plan === "PREMIUM"
    ? `Your plan includes up to ${units} units. For more, please contact us.`
    : `The ${label} plan includes up to ${units} units. Upgrade to add more.`;
}

export function userLimitMessage(plan: PlanName): string {
  const { users, label } = PLAN_CONFIG[plan];
  return users === 1
    ? `The ${label} plan includes 1 user. Upgrade to Premium to add your team.`
    : `Your plan includes up to ${users} users. Turn someone off first, or contact us for more.`;
}

/** What each plan adds, in plain words, for the plan comparison. */
export const PLAN_HIGHLIGHTS: Record<PlanName, string[]> = {
  FREE: [
    "Buildings, units, tenants and occupancy",
    "Leases, the calendar and the spreadsheet-style table",
    "Daily reminder email (standard lead times)",
    "Rent schedules, deposits and advance rent",
    "Excel/CSV export of leases",
    "All privacy tools",
  ],
  PRO: [
    "Everything in Free",
    "Your own reminder lead times",
    "Payments, credits and voids",
    "Overdue list with aging",
    "Printable payment acknowledgement",
    "The six reports",
  ],
  PREMIUM: [
    "Everything in Pro",
    `Up to ${PLAN_CONFIG.PREMIUM.users} users, with roles`,
    "Document storage",
    "The audit log",
  ],
};

/** A longer line for the "Available on …" screen. */
export const FEATURE_DESCRIPTIONS: Record<Feature, string> = {
  payments:
    "Record rent payments, credits and voids, see the overdue list with aging, and print acknowledgements.",
  reports:
    "Six ready-made reports, such as rent roll, collections and expiring leases, with Excel downloads.",
  customReminders: "Choose your own reminder lead times for each property type and unit.",
  team: "Add your team, each with their own sign-in and role.",
  documents: "Keep signed contracts and IDs with each lease, stored securely.",
  auditLog: "See who did what, and when, across your account.",
};

/**
 * Which "trial ends soon" email is due today, if any. `lastDay` is the trial's last Manila day,
 * `daysLeft` the calendar days from today to it. The smallest lead time not yet sent whose day
 * has come is due (so a missed day catches up, and one email never follows another the same day).
 */
export function trialReminderDue(daysLeft: number, alreadySent: readonly number[]): number | null {
  if (daysLeft < 0) return null;
  const due = [...TRIAL_REMINDER_DAYS]
    .sort((a, b) => a - b)
    .find((d) => daysLeft <= d && !alreadySent.includes(d));
  // Once a smaller reminder went out, a larger one is never sent late.
  if (due === undefined || alreadySent.some((s) => s < due)) return null;
  return due;
}

/** A trial started now ends at the end of the Manila day TRIAL_DAYS from today (that day included). */
export function trialEndsAtFor(now: Date): Date {
  const lastDay = new Date(
    new Date(`${manilaToday(now)}T00:00:00Z`).getTime() + TRIAL_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  return new Date(`${lastDay}T23:59:59.999+08:00`);
}
