import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { DetailList } from "@/components/app/detail-list";
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
import { formatPeso } from "@/domain/money/money";
import { formatIsoDate } from "@/domain/time/manila";
import { PRIVACY_ACK_METHOD_LABELS, TENANT_TYPE_LABELS } from "@/schemas/tenant";
import { requirePageUser } from "@/server/auth/current";
import { getTenant } from "@/server/tenants/service";
import { TenantActionsBar } from "./tenant-actions-bar";

export const metadata: Metadata = { title: "Tenant" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("tenant.view");
  const { id } = await params;
  const t = await getTenant(actor, id);
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
        <Card>
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
            <p className="text-muted-foreground mt-3 text-sm">
              Exporting or anonymising this tenant&apos;s data arrives in a later update (Admins
              only).
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Leases</CardTitle>
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
      </div>
    </>
  );
}
