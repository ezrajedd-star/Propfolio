"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import {
  createTenant,
  searchTenantsForPicker,
  setTenantArchived,
  updateTenant,
} from "@/server/tenants/service";

export async function createTenantAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("tenant.edit");
    const t = await createTenant(actor, input, await requestMeta());
    revalidatePath("/tenants");
    return { id: t.id, displayName: t.displayName };
  });
}

export async function updateTenantAction(id: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("tenant.edit");
    await updateTenant(actor, id, input, await requestMeta());
    revalidatePath("/", "layout");
    return null;
  });
}

export async function archiveTenantAction(id: string, archived: boolean) {
  return runAction(async () => {
    const actor = await requireActor("record.archive");
    await setTenantArchived(actor, id, archived, await requestMeta());
    revalidatePath("/", "layout");
    return null;
  });
}

export async function searchTenantsAction(q: string) {
  return runAction(async () => {
    const actor = await requireActor("tenant.view");
    return searchTenantsForPicker(actor, typeof q === "string" ? q.slice(0, 100) : "");
  });
}
