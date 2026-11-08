import type { Metadata } from "next";
import Link from "next/link";

import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/domain/auth/roles";
import { getCurrentSession } from "@/server/auth/current";
import { googleEnabled } from "@/server/auth/google";
import { getInvitation } from "@/server/team/service";
import { JoinForm, JoinSignedInButton } from "./join-forms";

export const metadata: Metadata = { title: "Join your team" };

const REASONS = {
  unknown: "This invitation link isn't right. Check you copied all of it, or ask for a new one.",
  expired:
    "This invitation has expired (links work for 7 days). Ask the person who invited you for a new one.",
  used: "This invitation was already used or withdrawn. If you've joined, just sign in.",
};

/** What the invited person sees: who invited them, to what, as which role; then one way in. */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const inv = await getInvitation(token);
  if (!inv.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Invitation</h1>
        <FormAlert className="mt-6">{REASONS[inv.reason]}</FormAlert>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </>
    );
  }
  const session = await getCurrentSession();
  const next = `/invite/${token}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">Join {inv.accountName}</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        {inv.inviterName ? `${inv.inviterName} invited you` : "You're invited"} as{" "}
        <span className="text-foreground font-medium">{ROLE_LABELS[inv.role]}</span>:{" "}
        {ROLE_DESCRIPTIONS[inv.role]}
      </p>
      {error === "google" ? (
        <FormAlert className="mb-6">
          That didn&apos;t work with Google. Choose the Google account for {inv.email}, or set a
          password below.
        </FormAlert>
      ) : null}
      {session ? (
        session.user.email === inv.email ? (
          <JoinSignedInButton token={token} accountName={inv.accountName} />
        ) : (
          <FormAlert>
            You&apos;re signed in as {session.user.email}, but this invitation is for {inv.email}.
            Sign out, then open the link again.
          </FormAlert>
        )
      ) : inv.hasAccount ? (
        <div className="space-y-4">
          <p>{inv.email} already has a Propfolio sign-in. Sign in to join the team.</p>
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in to join</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {googleEnabled() ? (
            <>
              <GoogleButton
                href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
                label="Join with Google"
              />
              <OrDivider />
            </>
          ) : null}
          <JoinForm token={token} email={inv.email} />
        </div>
      )}
    </>
  );
}
