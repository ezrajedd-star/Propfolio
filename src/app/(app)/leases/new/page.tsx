import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { TaskTourButton } from "@/components/app/guide";
import { PageHeader } from "@/components/app/page-header";
import { manilaToday } from "@/domain/time/manila";
import { renderPrivacyNotice } from "@/schemas/settings";
import { requirePageUser } from "@/server/auth/current";
import { isUuid } from "@/server/db-errors";
import { getLeaseDraft } from "@/server/leases/drafts";
import { listBuildings } from "@/server/property/buildings";
import { listUnits } from "@/server/property/units";
import { getSettings } from "@/server/settings/service";
import { getTenant } from "@/server/tenants/service";
import { LeaseWizard } from "./lease-wizard";

export const metadata: Metadata = { title: "New lease" };

export default async function NewLeasePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; tenant?: string }>;
}) {
  const actor = await requirePageUser("lease.edit");
  const sp = await searchParams;
  const [units, buildings, settings, draft] = await Promise.all([
    listUnits(actor),
    listBuildings(actor),
    getSettings(),
    getLeaseDraft(actor),
  ]);
  const presetTenant =
    sp.tenant && isUuid(sp.tenant) ? await getTenant(actor, sp.tenant).catch(() => null) : null;
  const presetUnit = sp.unit && units.some((u) => u.id === sp.unit) ? sp.unit : undefined;

  return (
    <>
      <BackLink href="/leases">Leases</BackLink>
      <PageHeader
        title="New lease"
        description="Four short steps. Your progress is saved as you go."
        actions={<TaskTourButton id="new-lease" />}
      />
      <LeaseWizard
        units={units.map((u) => ({
          id: u.id,
          unitNumber: u.unitNumber,
          buildingId: u.building.id,
          buildingName: u.building.name,
          unitType: u.unitType.name,
          occupancy: u.occupancy,
          currentTenant: u.currentLease?.tenantName ?? null,
          currentEnd: u.currentLease
            ? (u.currentLease.terminationDate ?? u.currentLease.endDate)
            : null,
          reminderConfig: u.reminderConfig,
        }))}
        buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
        privacyNotice={renderPrivacyNotice(settings)}
        today={manilaToday()}
        draft={
          presetUnit || presetTenant
            ? null
            : draft
              ? { step: draft.step, values: draft.values, savedAt: draft.updatedAt.toISOString() }
              : null
        }
        preset={{
          unitId: presetUnit,
          tenant:
            presetTenant && !presetTenant.archivedAt
              ? { id: presetTenant.id, displayName: presetTenant.displayName }
              : undefined,
        }}
      />
    </>
  );
}
