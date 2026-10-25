"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { AppError } from "@/server/errors";
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
import { quickEditLease } from "@/server/leases/quick-edit";
import { saveGridLayout } from "@/server/preferences";
import { markReminderHandled, unmarkReminderHandled } from "@/server/reminders/handled";

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

export async function quickEditLeaseAction(leaseId: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    return quickEditLease(actor, leaseId, input, await requestMeta());
  });
}

export async function saveGridLayoutAction(layout: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.view");
    await saveGridLayout(actor, layout);
    return null;
  });
}

/** Bulk archive (or restore) from the grid. Reports each lease that couldn't be changed. */
export async function archiveLeasesAction(ids: string[], archived: boolean) {
  return runAction(async () => {
    const actor = await requireActor("record.archive");
    const meta = await requestMeta();
    const list = Array.isArray(ids) ? ids.slice(0, 500) : [];
    const done: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of list) {
      try {
        await setLeaseArchived(actor, id, archived, meta);
        done.push(id);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        failed.push({ id, message: err.message });
      }
    }
    refresh();
    return { done, failed };
  });
}

export async function markHandledAction(leaseId: string, note?: string) {
  return runAction(async () => {
    const actor = await requireActor("reminder.handle");
    await markReminderHandled(actor, leaseId, { note: note ?? "" }, await requestMeta());
    refresh();
    return null;
  });
}

export async function unmarkHandledAction(leaseId: string) {
  return runAction(async () => {
    const actor = await requireActor("reminder.handle");
    await unmarkReminderHandled(actor, leaseId, await requestMeta());
    refresh();
    return null;
  });
}
