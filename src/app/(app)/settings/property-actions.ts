"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { createBuilding, setBuildingArchived, updateBuilding } from "@/server/property/buildings";
import { createUnitType, setUnitTypeArchived, updateUnitType } from "@/server/property/unit-types";
import {
  createUnit,
  setUnitArchived,
  setUnitReminderOverride,
  updateUnit,
} from "@/server/property/units";
import { requestMeta } from "@/server/request-meta";
import { updateSettings } from "@/server/settings/service";

function refresh() {
  revalidatePath("/", "layout");
}

export async function saveBuildingAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    const meta = await requestMeta();
    const b = id
      ? await updateBuilding(actor, id, input, meta)
      : await createBuilding(actor, input, meta);
    refresh();
    return { id: b.id };
  });
}

export async function archiveBuildingAction(id: string, archived: boolean) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    await setBuildingArchived(actor, id, archived, await requestMeta());
    refresh();
    return null;
  });
}

export async function saveUnitTypeAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    const meta = await requestMeta();
    const t = id
      ? await updateUnitType(actor, id, input, meta)
      : await createUnitType(actor, input, meta);
    refresh();
    return { id: t.id };
  });
}

export async function archiveUnitTypeAction(id: string, archived: boolean) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    await setUnitTypeArchived(actor, id, archived, await requestMeta());
    refresh();
    return null;
  });
}

export async function saveUnitAction(id: string | null, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    const meta = await requestMeta();
    const u = id ? await updateUnit(actor, id, input, meta) : await createUnit(actor, input, meta);
    refresh();
    return { id: u.id };
  });
}

export async function archiveUnitAction(id: string, archived: boolean) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    await setUnitArchived(actor, id, archived, await requestMeta());
    refresh();
    return null;
  });
}

export async function saveUnitRemindersAction(id: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("property.manage");
    await setUnitReminderOverride(actor, id, input, await requestMeta());
    refresh();
    return null;
  });
}

/** System default reminders, privacy notice and retention live in settings. */
export async function saveSettingsAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("settings.manage");
    await updateSettings(actor, input, await requestMeta());
    refresh();
    return null;
  });
}
