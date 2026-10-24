"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { discardLeaseDraft, saveLeaseDraft } from "@/server/leases/drafts";
import {
  createLease,
  renewLease,
  setLeaseArchived,
  terminateLease,
  updateLease,
} from "@/server/leases/service";
import { requestMeta } from "@/server/request-meta";

const refresh = () => revalidatePath("/", "layout");

export async function createLeaseAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    const lease = await createLease(actor, input, await requestMeta());
    refresh();
    return { id: lease.id, refNo: lease.refNo };
  });
}

export async function updateLeaseAction(id: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    await updateLease(actor, id, input, await requestMeta());
    refresh();
    return null;
  });
}

export async function renewLeaseAction(id: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    const lease = await renewLease(actor, id, input, await requestMeta());
    refresh();
    return { id: lease.id, refNo: lease.refNo };
  });
}

export async function terminateLeaseAction(id: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    await terminateLease(actor, id, input, await requestMeta());
    refresh();
    return null;
  });
}

export async function archiveLeaseAction(id: string, archived: boolean) {
  return runAction(async () => {
    const actor = await requireActor("record.archive");
    await setLeaseArchived(actor, id, archived, await requestMeta());
    refresh();
    return null;
  });
}

export async function saveLeaseDraftAction(data: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    await saveLeaseDraft(actor, data);
    return null;
  });
}

export async function discardLeaseDraftAction() {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    await discardLeaseDraft(actor);
    return null;
  });
}
