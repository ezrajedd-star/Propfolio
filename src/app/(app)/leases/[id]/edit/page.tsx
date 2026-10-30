import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { assertIdOrNotFound, orNotFound } from "@/server/pages";
import { getLease } from "@/server/leases/service";
import { listUnits } from "@/server/property/units";
import { listTenants } from "@/server/tenants/service";
import { EditLeaseForm } from "./edit-lease-form";

export const metadata: Metadata = { title: "Change lease" };

export default async function EditLeasePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("lease.edit");
  const { id } = await params;
  assertIdOrNotFound(id);
  const lease = await orNotFound(getLease(actor, id));
  if (!lease.actions.canEdit) redirect(`/leases/${id}`);
  const [units, tenants] = await Promise.all([listUnits(actor), listTenants(actor)]);

  return (
    <>
      <BackLink href={`/leases/${id}`}>{lease.refNo}</BackLink>
      <PageHeader
        title={`Change ${lease.refNo}`}
        description="Change the dates, rent or other terms. You'll see exactly what changes before anything is saved. Every change is recorded in the lease history."
      />
      <EditLeaseForm
        leaseId={id}
        units={units.map((u) => ({ id: u.id, label: `${u.building.name} · Unit ${u.unitNumber}` }))}
        tenants={tenants
          .filter((t) => !t.archived)
          .map((t) => ({ id: t.id, label: t.displayName }))}
        original={{
          unitId: lease.unit.id,
          tenantId: lease.tenant.id,
          startDate: lease.startDate,
          endDate: lease.endDate,
          monthlyRent: lease.monthlyRent,
          rentDueDay: lease.rentDueDay,
          securityDeposit: lease.securityDeposit,
          advanceRentType: lease.advanceRentType,
          advanceRentMonths: lease.advanceRentMonths,
          advanceRentAmount: lease.advanceRentAmount ?? "",
          escalationType: lease.escalationType,
          escalationPercent: lease.escalationPercent ?? "",
          escalationEveryMonths: lease.escalationEveryMonths ?? 12,
          escalationSteps: lease.escalationSteps ?? [],
          remarks: lease.remarks ?? "",
        }}
      />
    </>
  );
}
