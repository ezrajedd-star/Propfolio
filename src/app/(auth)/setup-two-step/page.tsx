import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePageUser } from "@/server/auth/current";
import { getTwoStepSummary, startTwoStepSetup } from "@/server/auth/two-step";
import { SetupTwoStepForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up two-step sign-in" };

export default async function SetupTwoStepPage() {
  const actor = await requirePageUser(undefined, { duringTwoStepSetup: true });
  const summary = await getTwoStepSummary(actor);
  if (summary.state === "on") redirect("/account/two-step");
  const setup = await startTwoStepSetup(actor);
  const mustSetUp = summary.state === "setup_required";

  return (
    <>
      <h1 className="text-2xl font-semibold">Set up two-step sign-in</h1>
      <p className="text-muted-foreground mt-1.5 mb-6">
        {summary.required
          ? "As an Owner or Admin you can see and change all of your company's records, so signing in needs two steps: your password, and a code from an app on your phone. It takes about two minutes."
          : "Signing in will need two steps: your password, and a code from an app on your phone. Someone who learns your password still can't get in."}
      </p>
      <SetupTwoStepForm secret={setup.secret} qrSvg={setup.qrSvg} />
      {!mustSetUp ? (
        <p className="mt-5 text-center">
          <Link
            href="/account/two-step"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Not now
          </Link>
        </p>
      ) : null}
    </>
  );
}
