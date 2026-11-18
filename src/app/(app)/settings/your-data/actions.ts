"use server";

import { redirect } from "next/navigation";

import { closeAccount } from "@/server/accounts/closing";
import { runAction, type ActionResult } from "@/server/actions";
import { clearSessionCookie, requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";

/** The Owner closes the account; they are signed out straight away. */
export async function closeAccountAction(input: unknown): Promise<ActionResult> {
  const r = await runAction(async () => {
    const actor = await requireActor("billing.manage", { duringReadOnly: true });
    return closeAccount(actor, input, await requestMeta());
  });
  if (!r.ok) return r;
  await clearSessionCookie();
  redirect("/login?reason=account-closed");
}
