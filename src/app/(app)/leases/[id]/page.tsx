import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { DetailList } from "@/components/app/detail-list";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { LeaseStatusBadge } from "@/components/app/lease-badges";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auditActionLabel } from "@/domain/audit/labels";
import { describeTerms } from "@/domain/leases/describe";
import { formatPeso } from "@/domain/money/money";
import { formatDateTime, formatIsoDate, manilaToday } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { getEntityHistory } from "@/server/audit-log/entity-history";
import { requirePageUser } from "@/server/auth/current";
import { assertIdOrNotFound, orNotFound } from "@/server/pages";
import { getLeaseLedger } from "@/server/billing/payments";
import { listDocuments } from "@/server/documents/service";
import { getLease } from "@/server/leases/service";
import { getLeaseReminderView } from "@/server/reminders/queries";
import { LeaseActions } from "./lease-actions";
import { LeaseTabs } from "./lease-tabs";
import { PaymentsTab } from "./payments-tab";
import { RemindersTab } from "./reminders-tab";

export const metadata: Metadata = { title: "Lease" };

function describeChange(key: string, change: unknown): string {
  const c = change as { before?: unknown; after?: unknown };
  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "empty";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return formatIsoDate(v);
    if (typeof v === "string" && /^\d+\.\d{2}$/.test(v)) return formatPeso(v);
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  const label = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return `${label}: ${fmt(c.before)} → ${fmt(c.after)}`;
}

export default async function LeasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requirePageUser("lease.view");
  const { id } = await params;
  assertIdOrNotFound(id);
  const { tab } = await searchParams;
  const [lease, history, reminderView, ledger, documents] = await orNotFound(
    Promise.all([
      getLease(actor, id),
      getEntityHistory(actor, "Lease", id),
      getLeaseReminderView(actor, id),
      getLeaseLedger(actor, id),
      listDocuments(actor, { leaseId: id }),
    ]),
  );
  const today = manilaToday();

  const overview = (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Lease</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              {
                label: "Tenant",
                value: (
                  <Link href={`/tenants/${lease.tenant.id}`} className="text-primary underline">
                    {lease.tenant.displayName}
                  </Link>
                ),
              },
              {
                label: "Unit",
                value: (
                  <Link
                    href={`/units/${lease.unit.id}`}
                    className="text-primary underline"
                  >{`Unit ${lease.unit.unitNumber}, ${lease.building.name}`}</Link>
                ),
              },
              { label: "Unit type", value: lease.unitType.name },
              { label: "Start", value: formatIsoDate(lease.startDate) },
              { label: "End", value: formatIsoDate(lease.endDate) },
              { label: "Length", value: lease.duration },
              {
                label: "Calendar",
                value: (
                  <Link
                    href={`/calendar?date=${lease.terminationDate ?? lease.endDate}`}
                    className="text-primary underline"
                  >
                    Show the end date on the calendar
                  </Link>
                ),
              },
              ...(lease.terminationDate
                ? [
                    { label: "Ended early on", value: formatIsoDate(lease.terminationDate) },
                    { label: "Reason", value: lease.terminationReason },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Money terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {describeTerms(lease).map((l) => (
            <p key={l}>{l}</p>
          ))}
          {lease.remarks ? (
            <div className="bg-muted mt-4 rounded-lg p-3">
              <p className="text-muted-foreground text-sm">Remarks</p>
              <p className="whitespace-pre-line">{lease.remarks}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );

  const reminders = (
    <RemindersTab
      leaseId={lease.id}
      tenantName={lease.tenant.displayName}
      config={lease.reminders.config}
      source={lease.reminders.source}
      view={reminderView}
      today={today}
    />
  );

  const historyTab = (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <Card>
        <CardHeader>
          <CardTitle>Renewal history</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="border-border relative space-y-6 border-l-2 pl-6">
            {lease.chain.map((c) => (
              <li key={c.id} className="relative">
                <span
                  className={cn(
                    "border-card absolute top-1.5 -left-[31px] size-4 rounded-full border-2",
                    c.current ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
                <div className="flex flex-wrap items-center gap-2">
                  {c.current ? (
                    <span className="font-semibold">{c.refNo} (this lease)</span>
                  ) : (
                    <Link href={`/leases/${c.id}`} className="text-primary font-semibold underline">
                      {c.refNo}
                    </Link>
                  )}
                  <LeaseStatusBadge status={c.status} />
                </div>
                <p className="text-muted-foreground">
                  {formatIsoDate(c.startDate)} – {formatIsoDate(c.endDate)}
                </p>
              </li>
            ))}
          </ol>
          {lease.chain.length === 1 ? (
            <p className="text-muted-foreground mt-4">This lease hasn&apos;t been renewed.</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y">
            {history.map((h) => {
              const changes =
                h.changes && typeof h.changes === "object" && h.action === "lease.update"
                  ? Object.entries(h.changes)
                  : [];
              const meta = (h.metadata ?? {}) as Record<string, unknown>;
              return (
                <li key={h.seq} className="py-3">
                  <p>
                    <span className="font-medium">{auditActionLabel(h.action)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {h.actorName ?? "System"} · {formatDateTime(h.at)}
                    </span>
                  </p>
                  {changes.map(([k, v]) => (
                    <p key={k} className="text-muted-foreground text-sm">
                      {describeChange(k, v)}
                    </p>
                  ))}
                  {typeof meta.paymentNo === "string" ? (
                    <p className="text-muted-foreground text-sm">
                      {meta.paymentNo}
                      {typeof meta.amount === "string" ? ` · ${formatPeso(meta.amount)}` : ""}
                    </p>
                  ) : null}
                  {typeof meta.description === "string" ? (
                    <p className="text-muted-foreground text-sm">
                      {meta.description}
                      {typeof meta.amount === "string" ? ` · ${formatPeso(meta.amount)}` : ""}
                    </p>
                  ) : null}
                  {typeof meta.reason === "string" ? (
                    <p className="text-muted-foreground text-sm">Reason: {meta.reason}</p>
                  ) : null}
                  {typeof meta.renewalOf === "string" ? (
                    <p className="text-muted-foreground text-sm">Renewal of {meta.renewalOf}</p>
                  ) : null}
                  {typeof meta.renewedBy === "string" ? (
                    <p className="text-muted-foreground text-sm">Renewed by {meta.renewedBy}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <>
      <BackLink href="/leases">Leases</BackLink>
      <PageHeader
        title={lease.tenant.displayName}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              {lease.refNo} · Unit {lease.unit.unitNumber}, {lease.building.name}
            </span>
            <LeaseStatusBadge status={lease.status} />
            {lease.archived ? <Badge variant="neutral">Archived</Badge> : null}
            <span className="text-foreground font-medium">
              {lease.statusDetail ?? lease.timeLeft}
            </span>
          </span>
        }
        actions={
          <LeaseActions
            leaseId={lease.id}
            refNo={lease.refNo}
            tenantName={lease.tenant.displayName}
            startDate={lease.startDate}
            endDate={lease.endDate}
            today={today}
            actions={lease.actions}
          />
        }
      />
      <LeaseTabs
        initial={tab}
        tabs={[
          { value: "overview", label: "Overview", content: overview },
          {
            value: "payments",
            label: "Payments",
            content: <PaymentsTab leaseId={lease.id} ledger={ledger} today={today} />,
          },
          {
            value: "documents",
            label: "Documents",
            content: (
              <DocumentsPanel
                target={{ leaseId: lease.id }}
                canUpload={documents.canUpload && !lease.archived}
                documents={documents.rows.map((d) => ({
                  ...d,
                  uploadedAt: d.uploadedAt.toISOString(),
                }))}
              />
            ),
          },
          { value: "reminders", label: "Reminders", content: reminders },
          { value: "history", label: "History", content: historyTab },
        ]}
      />
    </>
  );
}
