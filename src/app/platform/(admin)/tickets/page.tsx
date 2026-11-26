import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_SHORT,
  TICKET_LANGUAGE_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  ticketNumber,
  type TicketCategory,
  type TicketStatus,
} from "@/domain/tickets/tickets";
import { requirePlatformPage } from "@/server/platform/current";
import { listTickets } from "@/server/tickets/service";
import { STATUS_TONE } from "./ticket-tone";

export const metadata: Metadata = { title: "Tickets" };

/** "3 hours", "2 days": how long the customer has been waiting since their last message. */
function age(from: Date, now: Date): string {
  const hours = Math.floor((now.getTime() - from.getTime()) / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const admin = await requirePlatformPage("tickets.view", { action: "console.tickets_listed" });
  const sp = await searchParams;
  const status =
    sp.status === "ALL"
      ? undefined
      : ((TICKET_STATUSES.find((s) => s === sp.status) as TicketStatus | undefined) ?? "OPEN");
  const category = TICKET_CATEGORIES.find((c) => c === sp.category) as TicketCategory | undefined;
  const tickets = await listTickets(admin, { status, category });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Tickets"
        description="Help requests from customers. Oldest waiting first."
      />
      <form className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="status" className="mb-1 block font-medium">
            Status
          </label>
          <NativeSelect id="status" name="status" defaultValue={sp.status ?? "OPEN"}>
            <option value="OPEN">All open</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="ALL">Everything</option>
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block font-medium">
            Category
          </label>
          <NativeSelect id="category" name="category" defaultValue={category ?? ""}>
            <option value="">Any</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_SHORT[c]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit">Show tickets</Button>
        </div>
      </form>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead>Account</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                  No tickets here.
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((t) => (
                <TableRow key={t.id} className="align-top">
                  <TableCell>
                    <Link
                      href={`/platform/tickets/${t.id}`}
                      className="text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {ticketNumber(t.number)}: {t.subject}
                    </Link>
                    <div className="text-muted-foreground text-sm">{t.customerName}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={STATUS_TONE[t.status]}
                      label={TICKET_STATUS_LABELS[t.status]}
                    />
                  </TableCell>
                  <TableCell>{TICKET_CATEGORY_SHORT[t.category]}</TableCell>
                  <TableCell>{TICKET_LANGUAGE_LABELS[t.language]}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {t.status === "RESOLVED" ? "—" : age(t.lastCustomerMessageAt, now)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/platform/accounts/${t.accountId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {t.accountName}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
