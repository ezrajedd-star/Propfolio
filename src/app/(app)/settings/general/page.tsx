import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "./general-settings-form";
import { IdleTimeoutToggle } from "./idle-timeout-toggle";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralSettingsPage() {
  await requirePageUser("settings.manage", { duringReadOnly: true });
  const settings = await getSettings();
  const fromAddress = /<([^>]+)>/.exec(env().MAIL_FROM)?.[1] ?? env().MAIL_FROM;

  return (
    <>
      <PageHeader
        title="General"
        description="Basic details used across Propfolio and in emails."
      />
      <GeneralSettingsForm defaultValues={settings} fromAddress={fromAddress} />
      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Staying signed in</CardTitle>
        </CardHeader>
        <CardContent>
          <IdleTimeoutToggle initial={settings.adminIdleTimeout} />
        </CardContent>
      </Card>
    </>
  );
}
