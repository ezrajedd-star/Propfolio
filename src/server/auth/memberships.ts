import type { Role } from "@/domain/auth/roles";
import { asSystem, db } from "@/server/db";
import { loadPlanAccess, memberWithinUserLimit } from "@/server/plans/access";

export interface SignInTarget {
  accountId: string;
  role: Role;
}

/**
 * The account a person works in after signing in: of the accounts where they are turned on, that
 * aren't suspended, and whose plan has room for them (user limit), the one they used most
 * recently. Null when there is none.
 */
export function signInTarget(userId: string, now = new Date()): Promise<SignInTarget | null> {
  return asSystem(async () => {
    const candidates = await db.membership.findMany({
      where: { userId, isActive: true, account: { status: "ACTIVE" } },
      orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      select: { accountId: true, role: true, createdAt: true },
    });
    for (const m of candidates) {
      const { plan } = await loadPlanAccess(m.accountId, now, db);
      if (await memberWithinUserLimit(db, m, plan)) return { accountId: m.accountId, role: m.role };
    }
    return null;
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
