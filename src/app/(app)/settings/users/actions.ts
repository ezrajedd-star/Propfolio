"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { adminSendPasswordReset } from "@/server/auth/passwords";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import { createUser, setUserActive, unlockUser, updateUser } from "@/server/users/service";

const PATH = "/settings/users";

export async function createUserAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const { user, temporaryPassword } = await createUser(actor, input, await requestMeta());
    revalidatePath(PATH);
    return { name: user.name, email: user.email, temporaryPassword };
  });
}

export async function updateUserAction(id: string, input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    await updateUser(actor, id, input, await requestMeta());
    revalidatePath(PATH);
    return null;
  });
}

export async function setUserActiveAction(id: string, active: boolean) {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    await setUserActive(actor, id, active, await requestMeta());
    revalidatePath(PATH);
    return null;
  });
}

export async function unlockUserAction(id: string) {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    await unlockUser(actor, id, await requestMeta());
    revalidatePath(PATH);
    return null;
  });
}

export async function sendPasswordResetAction(id: string) {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    return { sent: await adminSendPasswordReset(actor, id, await requestMeta()) };
  });
}
