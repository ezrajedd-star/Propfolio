"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import { grantSupportAccess, revokeSupportAccess } from "@/server/support-access/service";

export async function grantSupportAccessAction(input: unknown) {
  const r = await runAction(async () =>
    grantSupportAccess(await requireActor("settings.manage"), input, await requestMeta()),
  );
  revalidatePath("/", "layout");
  return r;
}

export async function revokeSupportAccessAction() {
  const r = await runAction(async () => {
    await revokeSupportAccess(await requireActor("settings.manage"), await requestMeta());
    return null;
  });
  revalidatePath("/", "layout");
  return r;
}
