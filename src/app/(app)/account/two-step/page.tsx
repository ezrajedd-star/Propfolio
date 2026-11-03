import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TRUSTED_DEVICE_DAYS } from "@/domain/auth/two-step";
import { requirePageUser } from "@/server/auth/current";
import { getTwoStepSummary } from "@/server/auth/two-step";
import { ForgetDevicesButton, NewRecoveryCodes, TurnOffTwoStep } from "./two-step-forms";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default async function TwoStepPage() {
  const actor = await requirePageUser();
  const s = await getTwoStepSummary(actor);
  const on = s.state === "on";

  return (
    <>
      <BackLink href="/account">My account</BackLink>
      <PageHeader
        title="Two-step sign-in"
        description="Signing in needs your password and a code from an authenticator app on your phone, so someone who learns your password still can't get in."
        actions={
          on ? null : (
            <Button asChild>
              <Link href="/setup-two-step">Set up two-step sign-in</Link>
            </Button>
          )
        }
      />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="space-y-3">
            <p className="flex flex-wrap items-center gap-3">
              {on ? (
                <StatusBadge tone="success" label="On" />
              ) : (
                <StatusBadge tone="neutral" label="Off" />
              )}
              <span>
                {on
                  ? "You're asked for a code when you sign in."
                  : s.required
                    ? "Owners and Admins need it. Please set it up now."
                    : "Optional for your role, and recommended."}
              </span>
            </p>
            {on ? (
              <p className="text-muted-foreground">
                Recovery codes left: {s.recoveryCodesLeft} of 10.
                {s.recoveryCodesLeft <= 3 ? " Make new ones soon." : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {on ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Recovery codes</CardTitle>
                <CardDescription>
                  Each code lets you sign in once if you lose your phone. Making new ones stops the
                  old ones working.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NewRecoveryCodes />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Remembered devices</CardTitle>
                <CardDescription>
                  {s.rememberedDevices === 0
                    ? "No device skips the code."
                    : `${s.rememberedDevices} device${s.rememberedDevices === 1 ? "" : "s"} won't ask for a code for up to ${TRUSTED_DEVICE_DAYS} days. If you lost one, forget them all.`}
                </CardDescription>
              </CardHeader>
              {s.rememberedDevices > 0 ? (
                <CardContent>
                  <ForgetDevicesButton />
                </CardContent>
              ) : null}
            </Card>
            {!s.required ? (
              <Card>
                <CardHeader>
                  <CardTitle>Turn off</CardTitle>
                  <CardDescription>
                    Signing in will only need your password again. Not recommended.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TurnOffTwoStep />
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
