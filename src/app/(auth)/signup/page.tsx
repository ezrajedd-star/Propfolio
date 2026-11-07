import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { TRIAL_DAYS } from "@/domain/plans/plans";
import { getCurrentSession } from "@/server/auth/current";
import { googleEnabled } from "@/server/auth/google";
import { env } from "@/server/env";
import { SignUpFlow } from "./signup-flow";

export const metadata: Metadata = { title: "Start free" };

export default async function SignUpPage() {
  if (await getCurrentSession()) redirect("/");
  const e = env();
  const turnstileSiteKey =
    e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY ? e.TURNSTILE_SITE_KEY : null;
  return (
    <>
      <h1 className="text-2xl font-semibold">Start free</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        Premium free for {TRIAL_DAYS} days. No card needed. After that, keep up to 3 units free or
        choose a plan.
      </p>
      {googleEnabled() ? (
        <div className="mb-5 space-y-5">
          <GoogleButton href="/api/auth/google/start" label="Sign up with Google" />
          <OrDivider />
        </div>
      ) : null}
      <SignUpFlow turnstileSiteKey={turnstileSiteKey} />
      <p className="text-muted-foreground mt-6 border-t pt-5 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
