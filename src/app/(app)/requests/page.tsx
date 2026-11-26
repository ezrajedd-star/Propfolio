import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { HelpButton } from "@/components/app/help-button";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { TICKET_STATUS_CUSTOMER_LABELS, ticketNumber } from "@/domain/tickets/tickets";
import { formatDate } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { listMyTickets } from "@/server/tickets/service";

export const metadata: Metadata = { title: "My requests" };

const TONE = {
  NEW: "neutral",
  WAITING_ON_CUSTOMER: "warning",
  WAITING_ON_US: "default",
  RESOLVED: "success",
} as const;

export default async function MyRequestsPage() {
  const actor = await requirePageUser(undefined, { personal: true });
  const tickets = await listMyTickets(actor);
  return (
    <>
      <PageHeader
        title="My requests"
        description="Questions you've sent to Propfolio support, and our replies."
        actions={<HelpButton />}
      />
      {tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No requests yet">
          When you ask for help with the Help button, your requests appear here.
        </EmptyState>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/requests/${t.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 px-4 py-4"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{t.subject}</span>
                  <span className="text-muted-foreground block">
                    {ticketNumber(t.number)} · sent {formatDate(t.createdAt)}
                    {t.lastReplyAt ? ` · last reply ${formatDate(t.lastReplyAt)}` : ""}
                  </span>
                </span>
                <StatusBadge
                  tone={TONE[t.status]}
                  label={TICKET_STATUS_CUSTOMER_LABELS[t.status]}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
