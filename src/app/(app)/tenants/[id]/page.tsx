import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { DetailList } from "@/components/app/detail-list";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { LeaseStatusBadge } from "@/components/app/lease-badges";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/roles";
import { formatPeso, money } from "@/domain/money/money";
import { formatDateTime, formatIsoDate } from "@/domain/time/manila";
import { PRIVACY_ACK_METHOD_LABELS, TENANT_TYPE_LABELS } from "@/schemas/tenant";
import { requirePageUser } from "@/server/auth/current";
import { balancesForLeases } from "@/server/billing/balances";
import { listDocuments } from "@/server/documents/service";
import { getTenant } from "@/server/tenants/service";
import { PrivacyActions } from "./privacy-actions";
import { TenantActionsBar } from "./tenant-actions-bar";

export const metadata: Metadata = { title: "Tenant" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("tenant.view");
  const { id } = await params;
  const [t, documents] = await Promise.all([
    getTenant(actor, id),
    listDocuments(actor, { tenantId: id }),
  ]);
  const balances = await balancesForLeases(t.leases.map((l) => l.id));
  const totalDue = [...balances.values()].reduce((s, b) => s.plus(b.balanceDue), money(0));
  const totalOverdue = [...balances.values()].reduce((s, b) => s.plus(b.overdue), money(0));
  const archived = t.archivedAt !== null;

  return (
    <>
      <BackLink href="/tenants">Tenants</BackLink>
      <PageHeader
        title={t.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {TENANT_TYPE_LABELS[t.type]}
            {archived ? <Badge variant="neutral">Archived</Badge> : null}
          </span>
        }
        actions={
          <TenantActionsBar
            tenantId={t.id}
            archived={archived}
            canEdit={can(actor.role, "tenant.edit") && !t.anonymizedAt}
            canArchive={can(actor.role, "record.archive")}
            values={{
              type: t.type,
              displayName: t.displayName,
              registeredName: t.registeredName ?? "",
              tin: t.tin ?? "",
              contactPerson: t.contactPerson ?? "",
              phone: t.phone ?? "",
              email: t.email ?? "",
              billingAddress: t.billingAddress ?? "",
              notes: t.notes ?? "",
            }}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Registered name", value: t.registeredName },
                { label: "TIN", value: t.tin },
                { label: "Contact person", value: t.contactPerson },
                {
                  label: "Phone",
                  value: t.phone ? (
                    <a href={`tel:${t.phone}`} className="text-primary underline">
                      {t.phone}
                    </a>
                  ) : null,
                },
                {
                  label: "Email",
                  value: t.email ? (
                    <a href={`mailto:${t.email}`} className="text-primary underline">
                      {t.email}
                    </a>
                  ) : null,
                },
                {
                  label: "Billing address",
                  value: t.billingAddress ? (
                    <span className="whitespace-pre-line">{t.billingAddress}</span>
                  ) : null,
                },
                {
                  label: "Notes",
                  value: t.notes ? <span className="whitespace-pre-line">{t.notes}</span> : null,
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card data-guide="tenant-privacy">
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                {
                  label: "Privacy notice",
                  value: t.privacyAckDate
                    ? `Acknowledged on ${formatIsoDate(t.privacyAckDate)}${t.privacyAckMethod ? ` (${PRIVACY_ACK_METHOD_LABELS[t.privacyAckMethod].toLowerCase()})` : ""}`
                    : "Not recorded",
                },
              ]}
            />
            {t.anonymizedAt ? (
              <p className="mt-3">
                This tenant was anonymised on {formatDateTime(t.anonymizedAt)}. Their personal data
                has been removed; money records are kept.
              </p>
            ) : can(actor.role, "privacy.manage") ? (
              <PrivacyActions
                tenantId={t.id}
                tenantName={t.displayName}
                canAnonymise
                blockedReason={
                  t.leases.some((l) => ["ACTIVE", "EXPIRING", "UPCOMING"].includes(l.status))
                    ? "Anonymising is possible once none of their leases is current or upcoming."
                    : null
                }
              />
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                Admins can export or anonymise this tenant&apos;s data. To correct it, use Edit.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Leases</CardTitle>
              <p className="text-muted-foreground mt-1">
                Balance due now: <strong className="text-foreground">{formatPeso(totalDue)}</strong>
                {totalOverdue.greaterThan(0) ? (
                  <span className="text-danger font-medium">
                    {" "}
                    · {formatPeso(totalOverdue)} overdue
                  </span>
                ) : null}
              </p>
            </div>
            {can(actor.role, "lease.edit") && !archived ? (
              <Button asChild variant="outline">
                <Link href={`/leases/new?tenant=${t.id}`}>
                  <FilePlus2 aria-hidden /> New lease for this tenant
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {t.leases.length === 0 ? (
              <p className="text-muted-foreground">No leases yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Lease</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.leases.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link
                          href={`/leases/${l.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {l.refNo}
                        </Link>
                      </TableCell>
                      <TableCell>{l.unitLabel}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatIsoDate(l.startDate)} –{" "}
                        {formatIsoDate(l.terminationDate ?? l.endDate)}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatPeso(l.monthlyRent)}</TableCell>
                      <TableCell>
                        <LeaseStatusBadge status={l.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <section className="lg:col-span-2" aria-labelledby="tenant-documents">
          <h2 id="tenant-documents" className="mb-3 text-xl font-semibold">
            Documents
          </h2>
          <DocumentsPanel
            target={{ tenantId: t.id }}
            canUpload={documents.canUpload && !archived && !t.anonymizedAt}
            documents={documents.rows.map((d) => ({
              ...d,
              uploadedAt: d.uploadedAt.toISOString(),
            }))}
            showLease
          />
        </section>
      </div>
    </>
  );
}
