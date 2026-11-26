import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { DetailList } from "@/components/app/detail-list";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformCan } from "@/domain/platform/roles";
import {
  TICKET_CATEGORY_SHORT,
  TICKET_LANGUAGE_LABELS,
  TICKET_STATUS_LABELS,
  ticketNumber,
} from "@/domain/tickets/tickets";
import { formatDateTime } from "@/domain/time/manila";
import { isUuid } from "@/server/db-errors";
import { NotFoundError } from "@/server/errors";
import { requirePlatformPage } from "@/server/platform/current";
import { requestMeta } from "@/server/request-meta";
import { getTicket } from "@/server/tickets/service";
import { STATUS_TONE } from "../ticket-tone";
import { StaffReplyForm } from "./staff-reply";

export const metadata: Metadata = { title: "Ticket" };

const AUTHOR = {
  CUSTOMER: "Customer",
  STAFF: "Propfolio",
  AGENT: "Support agent",
  SYSTEM: "System",
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = await requirePlatformPage("tickets.view");
  const t = await getTicket(admin, id, await requestMeta()).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const canManage = platformCan(admin.role, "tickets.manage");
  return (
    <>
      <BackLink href="/platform/tickets">All tickets</BackLink>
      <PageHeader
        title={`${ticketNumber(t.number)}: ${t.subject}`}
        actions={
          <StatusBadge tone={STATUS_TONE[t.status]} label={TICKET_STATUS_LABELS[t.status]} />
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <ol className="space-y-4">
            {t.messages.map((m) => (
              <li key={m.id}>
                <Card
                  className={
                    m.internal
                      ? "border-warning/50 bg-warning-soft/40 border-dashed"
                      : m.author === "CUSTOMER"
                        ? ""
                        : "border-primary/40 bg-primary-soft/40"
                  }
                >
                  <CardContent className="space-y-2 pt-5">
                    <p className="text-muted-foreground text-sm">
                      <span className="text-foreground font-medium">{m.authorName}</span> (
                      {AUTHOR[m.author]}) · {formatDateTime(m.createdAt)}
                      {m.internal ? " · staff-only note" : ""}
                      {m.emailedAt ? " · emailed" : ""}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.hasScreenshot ? (
                      <a
                        href={`/platform/ticket-screenshot/${m.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex min-h-10 items-center underline underline-offset-4"
                      >
                        Open the screenshot
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Answer</CardTitle>
              </CardHeader>
              <CardContent>
                <StaffReplyForm ticketId={t.id} resolved={t.status === "RESOLVED"} />
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                {
                  label: "Account",
                  value: t.account ? (
                    <Link
                      href={`/platform/accounts/${t.account.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {t.account.name}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                {
                  label: "Customer",
                  value: t.customer ? `${t.customer.name} (${t.customer.email})` : "—",
                },
                { label: "Category", value: TICKET_CATEGORY_SHORT[t.category] },
                { label: "Reply in", value: TICKET_LANGUAGE_LABELS[t.language] },
                { label: "Opened", value: formatDateTime(t.createdAt) },
                { label: "Page they were on", value: t.pagePath ?? "—" },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
