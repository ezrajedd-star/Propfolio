import type { FunnelStep } from "@prisma/client";

import { asSystem, db } from "@/server/db";
import { isUniqueViolation } from "@/server/db-errors";

/**
 * Count a step of the sign-up journey for the platform admin's drop-off numbers. Account steps
 * count once per account (a second unit or lease adds nothing). Never fails the work it follows.
 */
export async function recordFunnelStep(
  step: FunnelStep,
  accountId: string | null,
  now = new Date(),
): Promise<void> {
  try {
    await asSystem(async () => {
      if (accountId) {
        const seen = await db.funnelEvent.count({ where: { accountId, step } });
        if (seen > 0) return;
      }
      await db.funnelEvent.create({ data: { step, accountId, createdAt: now } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    console.error("[funnel] not recorded:", (err as Error).name);
  }
}
