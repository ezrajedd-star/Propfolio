import { FilePlus2, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, withParams } from "@/components/app/filter-chips";
import { LeaseStatusBadge } from "@/components/app/lease-badges";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/roles";
import { LEASE_STATUSES, LEASE_STATUS_LABELS, type LeaseStatus } from "@/domain/leases/status";
import { formatPeso } from "@/domain/money/money";
import { formatIsoDate } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { listLeases } from "@/server/leases/service";

export const metadata: Metadata = { title: "Leases" };

type Search = { q?: string; status?: string; archived?: string; ending?: string };

const ENDING = ["30", "60", "90"];

export default async function LeasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePageUser("lease.view");
  const sp = await searchParams;
  const status = LEASE_STATUSES.includes(sp.status as LeaseStatus)
    ? (sp.status as LeaseStatus)
    : undefined;
  // "Current" = Active or Expiring (what the dashboard counts as active leases).
  const current = sp.status === "CURRENT";
  const ending = ENDING.includes(sp.ending ?? "")
    ? Number(sp.ending)
    : current
      ? Number.MAX_SAFE_INTEGER
      : undefined;
  const leases = await listLeases(actor, {
    q: sp.q,
    status,
    endingWithinDays: ending,
    includeArchived: sp.archived === "1",
  });

  return (
    <>
      <PageHeader
        title="Leases"
        description="Search by tenant, unit, building or reference number. Spelling doesn't need to be exact."
        actions={
          can(actor.role, "lease.edit") ? (
            <Button asChild>
              <Link href="/leases/new">
                <FilePlus2 aria-hidden /> New lease
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-6 space-y-4">
        <SearchBox
          defaultValue={sp.q}
          placeholder="e.g. abc corp, 12A, LSE-2026-0004"
          keep={{ status: sp.status, archived: sp.archived }}
        />
        <FilterChips
          label="Status"
          options={[
            { value: "", label: "All" },
            { value: "CURRENT", label: "Current" },
            ...LEASE_STATUSES.map((s) => ({ value: s, label: LEASE_STATUS_LABELS[s] })),
          ]}
          active={current ? "CURRENT" : (status ?? "")}
          hrefFor={(v) => withParams("/leases", sp, { status: v || undefined })}
        />
        <FilterChips
          label="Ending soon"
          options={[
            { value: "", label: "Any end date" },
            ...ENDING.map((d) => ({ value: d, label: `Ending in ${d} days` })),
          ]}
          active={sp.ending && ENDING.includes(sp.ending) ? sp.ending : ""}
          hrefFor={(v) => withParams("/leases", sp, { ending: v || undefined })}
        />
      </div>
      {leases.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={sp.q || status || ending ? "No leases match" : "No leases yet"}
          action={
            !sp.q && !status && !ending && can(actor.role, "lease.edit") ? (
              <Button asChild>
                <Link href="/leases/new">Add your first lease →</Link>
              </Button>
            ) : null
          }
        >
          {sp.q || status || ending ? (
            <>
              Try fewer words or{" "}
              <Link href="/leases" className="text-primary underline">
                clear the filters
              </Link>
              .
            </>
          ) : null}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Ref No.</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Time left</TableHead>
                <TableHead className="text-right">Monthly rent</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leases.map((l) => (
                <TableRow key={l.id} className={l.archived ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <Link
                      href={`/leases/${l.id}`}
                      className="text-primary inline-flex min-h-10 items-center font-medium hover:underline"
                    >
                      {l.refNo}
                    </Link>
                  </TableCell>
                  <TableCell>{l.tenant.displayName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.building.code} · {l.unit.unitNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatIsoDate(l.startDate)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatIsoDate(l.terminationDate ?? l.endDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{l.timeLeft}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(l.monthlyRent)}
                  </TableCell>
                  <TableCell>
                    <LeaseStatusBadge status={l.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="text-muted-foreground mt-4">
        {leases.length} lease{leases.length === 1 ? "" : "s"} ·{" "}
        <Link
          href={withParams("/leases", sp, { archived: sp.archived === "1" ? undefined : "1" })}
          className="text-primary hover:underline"
        >
          {sp.archived === "1" ? "Hide archived" : "Show archived"}
        </Link>
      </p>
    </>
  );
}
