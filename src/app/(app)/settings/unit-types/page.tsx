import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { listUnitTypes } from "@/server/property/unit-types";
import { getSettings } from "@/server/settings/service";
import { SystemDefaultCard, UnitTypesList } from "./unit-types-manager";

export const metadata: Metadata = { title: "Unit types and reminders" };

export default async function UnitTypesPage() {
  const actor = await requirePageUser("property.manage");
  const [unitTypes, settings] = await Promise.all([listUnitTypes(actor), getSettings()]);
  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Unit types and reminders"
        description="When to email the Leasing team before a lease ends. Settings pass down: default → unit type → a single unit's override."
      />
      <SystemDefaultCard initial={settings.reminderDefaults} />
      <UnitTypesList unitTypes={unitTypes} systemDefault={settings.reminderDefaults} />
    </>
  );
}
