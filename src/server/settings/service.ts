import type { Prisma } from "@prisma/client";

import {
  SETTINGS_DEFAULTS,
  settingsSchema,
  updateSettingsSchema,
  type Settings,
} from "@/schemas/settings";
import { writeAudit, type AuditActor } from "@/server/audit";
import { db } from "@/server/db";
import type { RequestMeta } from "@/server/request-meta";
import { assertCan } from "@/server/auth/authorize";
import { parseInput } from "@/server/validation";

/** Read all settings, falling back to defaults for missing or invalid values. */
export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.keys(SETTINGS_DEFAULTS) } },
  });
  const merged: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const row of rows) merged[row.key] = row.value;
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : SETTINGS_DEFAULTS;
}

export async function updateSettings(
  actor: AuditActor,
  input: unknown,
  meta: RequestMeta,
): Promise<Settings> {
  assertCan(actor, "settings.manage");
  const data = parseInput(updateSettingsSchema, input);
  const current = await getSettings();
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  await db.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(data) as [keyof Settings, unknown][]) {
      if (value === undefined || value === current[key]) continue;
      changes[key] = { before: current[key], after: value };
      await tx.setting.upsert({
        where: { key },
        create: {
          key,
          value: value as Prisma.InputJsonValue,
          createdById: actor.id,
          updatedById: actor.id,
        },
        update: { value: value as Prisma.InputJsonValue, updatedById: actor.id },
      });
    }
    if (Object.keys(changes).length > 0) {
      await writeAudit(
        { actor, action: "settings.update", entityType: "Setting", changes, meta },
        tx,
      );
    }
  });
  return getSettings();
}
