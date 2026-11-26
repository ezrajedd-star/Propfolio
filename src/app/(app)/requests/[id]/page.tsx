import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_CUSTOMER_LABELS,
  ticketNumber,
} from "@/domain/tickets/tickets";
import { formatDateTime } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { getMyTicket } from "@/server/tickets/service";
import { CustomerReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Request" };

export default async function MyRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser(undefined, { personal: true });
  const { id } = await params;
  const t = await getMyTicket(actor, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <>
      <BackLink href="/requests">My requests</BackLink>
      <PageHeader
        title={t.subject}
        description={`${ticketNumber(t.number)} · ${TICKET_CATEGORY_LABELS[t.category]}`}
        actions={
          <StatusBadge
            tone={
              t.status === "RESOLVED"
                ? "success"
                : t.status === "WAITING_ON_CUSTOMER"
                  ? "warning"
                  : "neutral"
            }
            label={TICKET_STATUS_CUSTOMER_LABELS[t.status]}
          />
        }
      />
      <ol className="mb-8 max-w-3xl space-y-4">
        {t.messages.map((m) => (
          <li key={m.id}>
            <Card className={m.author === "CUSTOMER" ? "" : "border-primary/40 bg-primary-soft/40"}>
              <CardContent className="space-y-2 pt-5">
                <p className="text-muted-foreground text-sm">
                  <span className="text-foreground font-medium">
                    {m.author === "CUSTOMER" ? m.authorName : `${m.authorName}, Propfolio support`}
                  </span>{" "}
                  · {formatDateTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.hasScreenshot ? (
                  <a
                    href={`/api/v1/requests/screenshot/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex min-h-10 items-center underline underline-offset-4"
                  >
                    See the screenshot
                  </a>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <div className="max-w-3xl">
        <CustomerReplyForm ticketId={t.id} resolved={t.status === "RESOLVED"} />
      </div>
    </>
  );
}
