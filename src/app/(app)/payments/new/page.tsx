import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { manilaToday } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { isUuid } from "@/server/db-errors";
import { getLease } from "@/server/leases/service";
import { RecordPaymentForm } from "./record-payment-form";

export const metadata: Metadata = { title: "Record payment" };

export default async function RecordPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ lease?: string }>;
}) {
  const actor = await requirePageUser("payment.record");
  const { lease: leaseId } = await searchParams;
  const lease =
    leaseId && isUuid(leaseId) ? await getLease(actor, leaseId).catch(() => null) : null;
  return (
    <>
      <BackLink href={lease ? `/leases/${lease.id}` : "/payments"}>
        {lease ? lease.refNo : "Payments"}
      </BackLink>
      <PageHeader
        title="Record a payment"
        description="Choose the lease, enter what was received, and check what it pays for."
      />
      <RecordPaymentForm
        today={manilaToday()}
        initialLease={
          lease && !lease.archived
            ? {
                id: lease.id,
                refNo: lease.refNo,
                tenantName: lease.tenant.displayName,
                unitLabel: `Unit ${lease.unit.unitNumber}, ${lease.building.name}`,
                balanceDue: "0",
              }
            : null
        }
      />
    </>
  );
}
