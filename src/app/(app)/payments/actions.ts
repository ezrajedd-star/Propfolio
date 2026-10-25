"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { addOtherCharge, previewChargeChanges, voidCharge } from "@/server/billing/charges";
import {
  applyCredit,
  openChargesForPayment,
  recordPayment,
  voidPayment,
} from "@/server/billing/payments";
import { listLeases } from "@/server/leases/service";
import { requestMeta } from "@/server/request-meta";

const refresh = () => revalidatePath("/", "layout");

export async function recordPaymentAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    const p = await recordPayment(actor, input, await requestMeta());
    refresh();
    return { id: p.id, paymentNo: p.paymentNo };
  });
}

export async function voidPaymentAction(paymentId: string, reason: string) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    await voidPayment(actor, paymentId, { reason }, await requestMeta());
    refresh();
    return null;
  });
}

export async function applyCreditAction(leaseId: string) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    const r = await applyCredit(actor, leaseId, await requestMeta());
    refresh();
    return r;
  });
}

export async function addChargeAction(leaseId: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    await addOtherCharge(actor, leaseId, input, await requestMeta());
    refresh();
    return null;
  });
}

export async function voidChargeAction(chargeId: string, reason: string) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    await voidCharge(actor, chargeId, { reason }, await requestMeta());
    refresh();
    return null;
  });
}

export async function openChargesAction(leaseId: string) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    return openChargesForPayment(actor, leaseId);
  });
}

/** Lease picker for the record-payment form (forgiving search). */
export async function findLeasesAction(q: string) {
  return runAction(async () => {
    const actor = await requireActor("payment.record");
    const rows = await listLeases(actor, { q: typeof q === "string" ? q.slice(0, 100) : "" });
    return rows
      .filter((r) => r.status !== "RENEWED" || Number(r.balanceDue) > 0)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        refNo: r.refNo,
        tenantName: r.tenant.displayName,
        unitLabel: `Unit ${r.unit.unitNumber}, ${r.building.name}`,
        balanceDue: r.balanceDue ?? "0.00",
      }));
  });
}

export async function previewChargesAction(leaseId: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("lease.edit");
    return previewChargeChanges(actor, leaseId, input);
  });
}
