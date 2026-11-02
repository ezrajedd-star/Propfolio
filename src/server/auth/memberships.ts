import type { Role } from "@/domain/auth/roles";
import { asSystem, db } from "@/server/db";

export interface SignInTarget {
  accountId: string;
  role: Role;
}

/**
 * The account a person works in after signing in: of the accounts where they are turned on and
 * that aren't suspended, the one they used most recently. Null when there is none.
 */
export function signInTarget(userId: string): Promise<SignInTarget | null> {
  return asSystem(async () => {
    const m = await db.membership.findFirst({
      where: { userId, isActive: true, account: { status: "ACTIVE" } },
      orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      select: { accountId: true, role: true },
    });
    return m;
  });
}

/** Any account the person belongs to, even turned off (for attributing audit entries). */
export function anyAccountOf(userId: string): Promise<string | null> {
  return asSystem(async () => {
    const m = await db.membership.findFirst({
      where: { userId },
      orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      select: { accountId: true },
    });
    return m?.accountId ?? null;
  });
}
