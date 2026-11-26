import { can, type Permission, type Role } from "@/domain/auth/roles";
import {
  READ_ONLY_MESSAGE,
  availableOnMessage,
  planDenial,
  planIncludes,
  type Feature,
  type PlanAccess,
} from "@/domain/plans/plans";
import { supportMay } from "@/domain/auth/support-access";
import { ForbiddenError, PlanLimitError } from "@/server/errors";
import type { SupportContext } from "./session";

export interface Actor {
  id: string;
  name: string;
  email: string;
  /** The person's role in `accountId`. */
  role: Role;
  /** The account this person is working in. Every query is limited to it. */
  accountId: string;
  /** What the account's plan allows right now (read from the database on every request). */
  access: PlanAccess;
  sessionId?: string;
  /** Set when Propfolio support is working in the account (support access). */
  support?: SupportContext;
}

export const SUPPORT_REFUSED =
  "Propfolio support can't do this, even with support access. Ask the account's Owner or a User Admin.";

type Checked = Pick<Actor, "role" | "access"> & { support?: SupportContext };

export interface CanOptions {
  /** Allowed while the account is read-only (archiving units to get back within the limit). */
  duringReadOnly?: boolean;
}

/** Role AND plan: the one check behind every page, action, API route and button. */
export function canDo(actor: Checked, permission: Permission, options: CanOptions = {}): boolean {
  if (actor.support && !supportMay(permission)) return false;
  return can(actor.role, permission) && planDenial(actor.access, permission, options) === null;
}

export function planLimitError(
  access: PlanAccess,
  permission: Permission,
  options: CanOptions = {},
): PlanLimitError | null {
  const denial = planDenial(access, permission, options);
  if (!denial) return null;
  return new PlanLimitError(
    denial.reason === "readOnly"
      ? READ_ONLY_MESSAGE
      : `${availableOnMessage(denial.feature)}. Upgrade to use it.`,
  );
}

export function assertCan(actor: Checked, permission: Permission, options: CanOptions = {}): void {
  if (actor.support && !supportMay(permission)) throw new ForbiddenError(SUPPORT_REFUSED);
  if (!can(actor.role, permission)) throw new ForbiddenError();
  const planError = planLimitError(actor.access, permission, options);
  if (planError) throw planError;
}

/** For features that aren't a permission of their own (e.g. custom reminder lead times). */
export function assertFeature(actor: Pick<Actor, "access">, feature: Feature): void {
  if (!planIncludes(actor.access.plan, feature)) {
    throw new PlanLimitError(`${availableOnMessage(feature)}. Upgrade to use it.`);
  }
}

/** Refuse any change while the account is read-only. */
export function assertWritable(actor: Pick<Actor, "access">): void {
  if (actor.access.readOnly) throw new PlanLimitError(READ_ONLY_MESSAGE);
}
