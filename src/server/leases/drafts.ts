import type { Prisma } from "@prisma/client";
import { z } from "zod";

import type { AuditActor } from "@/server/audit";
import { assertCan } from "@/server/auth/authorize";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

/**
 * The new-lease wizard autosaves here. A draft is loose (half-filled) form data, so it is only
 * checked for shape and size; the real validation happens when the lease is saved.
 */
const draftSchema = z.object({
  step: z.int().min(1).max(4),
  values: z.record(z.string(), z.unknown()),
});
export type LeaseDraftData = z.infer<typeof draftSchema>;

const MAX_DRAFT_BYTES = 20_000;
export const DRAFT_MAX_AGE_DAYS = 30;

export async function getLeaseDraft(
  actor: AuditActor,
): Promise<(LeaseDraftData & { updatedAt: Date }) | null> {
  assertCan(actor, "lease.edit");
  const row = await db.leaseDraft.findUnique({ where: { userId: actor.id } });
  if (!row) return null;
  const parsed = draftSchema.safeParse(row.data);
  return parsed.success ? { ...parsed.data, updatedAt: row.updatedAt } : null;
}

export async function saveLeaseDraft(actor: AuditActor, input: unknown): Promise<void> {
  assertCan(actor, "lease.edit");
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success || JSON.stringify(parsed.data).length > MAX_DRAFT_BYTES) {
    throw new ValidationError("This draft couldn't be saved.");
  }
  const data = parsed.data as unknown as Prisma.InputJsonValue;
  await db.leaseDraft.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, data },
    update: { data },
  });
}

export async function discardLeaseDraft(actor: AuditActor): Promise<void> {
  assertCan(actor, "lease.edit");
  await db.leaseDraft.deleteMany({ where: { userId: actor.id } });
}

/** Worker: drop drafts nobody has touched for 30 days. */
export async function purgeOldDrafts(now = new Date()): Promise<number> {
  const { count } = await db.leaseDraft.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - DRAFT_MAX_AGE_DAYS * 86_400_000) } },
  });
  return count;
}
