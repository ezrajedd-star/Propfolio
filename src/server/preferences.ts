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

const GUIDE_KEY = "guide";

export interface GuideState {
  /** The welcome tour was finished or skipped. */
  tourDone: boolean;
  /** The Guide notes are switched on. */
  on: boolean;
}

/** Everyone signed in has their own guide state, so the tour shows once per person. */
export async function getGuideState(actor: AuditActor): Promise<GuideState> {
  const row = await db.userPreference.findUnique({
    where: { userId_key: { userId: actor.id, key: GUIDE_KEY } },
  });
  const v = (row?.value ?? {}) as Partial<GuideState>;
  return { tourDone: v.tourDone === true, on: v.on === true };
}

export async function saveGuideState(actor: AuditActor, input: unknown): Promise<GuideState> {
  const patch = (input ?? {}) as Partial<Record<keyof GuideState, unknown>>;
  const current = await getGuideState(actor);
  const next: GuideState = {
    tourDone: typeof patch.tourDone === "boolean" ? patch.tourDone : current.tourDone,
    on: typeof patch.on === "boolean" ? patch.on : current.on,
  };
  const value = next as unknown as Prisma.InputJsonValue;
  await db.userPreference.upsert({
    where: { userId_key: { userId: actor.id, key: GUIDE_KEY } },
    create: { userId: actor.id, key: GUIDE_KEY, value },
    update: { value },
  });
  return next;
}
