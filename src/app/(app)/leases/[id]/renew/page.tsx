import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { addDays, addMonths, leaseDuration } from "@/domain/time/calendar-date";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import type { LeaseTermsInput } from "@/schemas/lease";
import { requirePageUser } from "@/server/auth/current";
import { getLease } from "@/server/leases/service";
import { RenewForm } from "./renew-form";

export const metadata: Metadata = { title: "Renew lease" };

export default async function RenewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("lease.edit");
  const { id } = await params;
  const lease = await getLease(actor, id);
  if (!lease.actions.canRenew) redirect(`/leases/${id}`);

  // Pre-fill: starts the day after the current lease ends, same length, same terms.
  const { years, months } = leaseDuration(lease.startDate, lease.endDate);
  const lengthMonths = years * 12 + months || 12;
  const startDate = addDays(lease.endDate, 1);
  const defaults: LeaseTermsInput = {
    startDate,
    endDate: addDays(addMonths(startDate, lengthMonths), -1),
    monthlyRent: lease.monthlyRent,
    rentDueDay: lease.rentDueDay,
    securityDeposit: lease.securityDeposit,
    advanceRentType: lease.advanceRentType,
    advanceRentMonths: lease.advanceRentMonths,
    advanceRentAmount: lease.advanceRentAmount ?? "",
    // Dated rent changes belong to the old term, so they aren't copied.
    escalationType: lease.escalationType === "SCHEDULE" ? "NONE" : lease.escalationType,
    escalationPercent: lease.escalationPercent ?? "",
    escalationEveryMonths: lease.escalationEveryMonths ?? 12,
    escalationSteps: [],
    remarks: "",
  };

  return (
    <>
      <BackLink href={`/leases/${id}`}>{lease.refNo}</BackLink>
      <PageHeader
        title={`Renew ${lease.tenant.displayName}'s lease`}
        description={`Unit ${lease.unit.unitNumber}, ${lease.building.name}. The current lease ends on ${formatIsoDate(lease.endDate)}. We've filled in the same terms — change anything that was renegotiated.`}
      />
      <RenewForm
        leaseId={id}
        refNo={lease.refNo}
        unitLabel={`Unit ${lease.unit.unitNumber}, ${lease.building.name} (${lease.unitType})`}
        tenantName={lease.tenant.displayName}
        defaults={defaults}
        reminderConfig={lease.reminders.config}
        today={manilaToday()}
      />
    </>
  );
}
