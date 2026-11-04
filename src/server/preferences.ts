import type { Prisma } from "@prisma/client";

import { isTaskTourId, type TaskTourId } from "@/domain/guide/content";
import { normalizeGridLayout, type GridLayout } from "@/domain/leases/grid-columns";
import { assertCan, type Actor } from "@/server/auth/authorize";
import { currentAccountId, db } from "@/server/db";

const GRID_KEY = "leaseGrid";

/** The user's own leases-grid layout (columns shown, order, grouping). */
export async function getGridLayout(actor: Actor): Promise<GridLayout> {
  assertCan(actor, "lease.view");
  const row = await db.userPreference.findUnique({
    where: {
      accountId_userId_key: {
        accountId: await currentAccountId(),
        userId: actor.id,
        key: GRID_KEY,
      },
    },
  });
  return normalizeGridLayout(row?.value);
}

export async function saveGridLayout(actor: Actor, input: unknown): Promise<GridLayout> {
  assertCan(actor, "lease.view");
  const layout = normalizeGridLayout(input);
  const value = layout as unknown as Prisma.InputJsonValue;
  await db.userPreference.upsert({
    where: {
      accountId_userId_key: {
        accountId: await currentAccountId(),
        userId: actor.id,
        key: GRID_KEY,
      },
    },
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
  /** Task tours (adding a lease, a tenant, units, reports) already seen. */
  toursDone: TaskTourId[];
}

/** Everyone signed in has their own guide state (per account), so each tour shows once per person. */
export async function getGuideState(actor: Actor): Promise<GuideState> {
  const row = await db.userPreference.findUnique({
    where: {
      accountId_userId_key: {
        accountId: await currentAccountId(),
        userId: actor.id,
        key: GUIDE_KEY,
      },
    },
  });
  const v = (row?.value ?? {}) as Partial<Record<keyof GuideState, unknown>>;
  return {
    tourDone: v.tourDone === true,
    on: v.on === true,
    toursDone: Array.isArray(v.toursDone) ? v.toursDone.filter(isTaskTourId) : [],
  };
}

/** `taskTourDone` adds one task tour to the list of tours seen. */
export async function saveGuideState(actor: Actor, input: unknown): Promise<GuideState> {
  const patch = (input ?? {}) as Record<string, unknown>;
  const current = await getGuideState(actor);
  const next: GuideState = {
    tourDone: typeof patch.tourDone === "boolean" ? patch.tourDone : current.tourDone,
    on: typeof patch.on === "boolean" ? patch.on : current.on,
    toursDone:
      isTaskTourId(patch.taskTourDone) && !current.toursDone.includes(patch.taskTourDone)
        ? [...current.toursDone, patch.taskTourDone]
        : current.toursDone,
  };
  const value = next as unknown as Prisma.InputJsonValue;
  await db.userPreference.upsert({
    where: {
      accountId_userId_key: {
        accountId: await currentAccountId(),
        userId: actor.id,
        key: GUIDE_KEY,
      },
    },
    create: { userId: actor.id, key: GUIDE_KEY, value },
    update: { value },
  });
  return next;
}
