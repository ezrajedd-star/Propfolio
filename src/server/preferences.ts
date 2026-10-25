import type { Prisma } from "@prisma/client";

import { normalizeGridLayout, type GridLayout } from "@/domain/leases/grid-columns";
import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";

const GRID_KEY = "leaseGrid";

/** The user's own leases-grid layout (columns shown, order, grouping). */
export async function getGridLayout(actor: AuditActor): Promise<GridLayout> {
  assertCan(actor, "lease.view");
  const row = await db.userPreference.findUnique({
    where: { userId_key: { userId: actor.id, key: GRID_KEY } },
  });
  return normalizeGridLayout(row?.value);
}

export async function saveGridLayout(actor: AuditActor, input: unknown): Promise<GridLayout> {
  assertCan(actor, "lease.view");
  const layout = normalizeGridLayout(input);
  const value = layout as unknown as Prisma.InputJsonValue;
  await db.userPreference.upsert({
    where: { userId_key: { userId: actor.id, key: GRID_KEY } },
    create: { userId: actor.id, key: GRID_KEY, value },
    update: { value },
  });
  return layout;
}
