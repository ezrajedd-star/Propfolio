import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings/service";
import { GeneralSettingsForm } from "./general-settings-form";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralSettingsPage() {
  await requirePageUser("settings.manage");
  const settings = await getSettings();
  const fromAddress = /<([^>]+)>/.exec(env().MAIL_FROM)?.[1] ?? env().MAIL_FROM;

  return (
    <>
      <PageHeader
        title="General"
        description="Basic details used across Propfolio and in emails."
      />
      <GeneralSettingsForm defaultValues={settings} fromAddress={fromAddress} />
    </>
  );
}
