"use server";

import { redirect } from "next/navigation";

import { runAction, type ActionResult } from "@/server/actions";
import { getCurrentSession, setSessionCookie } from "@/server/auth/current";
import { UnauthenticatedError } from "@/server/errors";
import { requestMeta } from "@/server/request-meta";
import { acceptInvitationNewPerson, acceptInvitationSignedIn } from "@/server/team/service";

/** Someone new: name, password, checkbox → joins the team and lands inside it. */
export async function acceptAsNewPersonAction(
  token: string,
  input: unknown,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    acceptInvitationNewPerson(token, input, await requestMeta()),
  );
  if (!result.ok) return result;
  await setSessionCookie(result.data.token, result.data.expiresAt);
  redirect("/?welcome=joined");
}

/** Already signed in with the invited email: join, and switch to the team's account. */
export async function acceptSignedInAction(token: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw new UnauthenticatedError();
    return acceptInvitationSignedIn(token, session.user, await requestMeta());
  });
  if (!result.ok) return result;
  await setSessionCookie(result.data.token, result.data.expiresAt);
  redirect("/?welcome=joined");
}
