"use server";

import { revalidatePath } from "next/cache";

import { runAction } from "@/server/actions";
import { adminSendPasswordReset } from "@/server/auth/passwords";
import { requireActor } from "@/server/auth/current";
import { requestMeta } from "@/server/request-meta";
import { inviteMember, revokeInvitation, transferOwnership } from "@/server/team/service";
import { setUserActive, unlockUser, updateUser } from "@/server/users/service";

const PATH = "/settings/users";

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

export async function inviteAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActor("user.manage");
    const r = await inviteMember(actor, input, await requestMeta());
    revalidatePath(PATH);
    return { link: r.link };
  });
}

export async function revokeInvitationAction(id: string) {
  return runAction(async () => {
    const actor = await requireActor("user.manage", { duringReadOnly: true });
    await revokeInvitation(actor, id, await requestMeta());
    revalidatePath(PATH);
    return null;
  });
}

/** The Owner hands the account to an Admin (and becomes an Admin). */
export async function transferOwnershipAction(userId: string) {
  return runAction(async () => {
    const actor = await requireActor("billing.manage", { duringReadOnly: true });
    await transferOwnership(actor, userId, await requestMeta());
    revalidatePath(PATH);
    return null;
  });
}
