import { FilePlus2, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, withParams } from "@/components/app/filter-chips";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/auth/roles";
import { LEASE_STATUSES, LEASE_STATUS_LABELS, type LeaseStatus } from "@/domain/leases/status";
import { requirePageUser } from "@/server/auth/current";
import { listLeases } from "@/server/leases/service";
import { getGridLayout } from "@/server/preferences";
import { listBuildings } from "@/server/property/buildings";
import { listUnitTypes } from "@/server/property/unit-types";
import { FilterSelect } from "./filter-select";
import { LeasesGrid } from "./leases-grid";

export const metadata: Metadata = { title: "Leases" };

type Search = {
  q?: string;
  status?: string;
  archived?: string;
  ending?: string;
  building?: string;
  unitType?: string;
};

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
  const [leases, layout, buildings, unitTypes] = await Promise.all([
    listLeases(actor, {
      q: sp.q,
      status,
      endingWithinDays: ending,
      buildingId: sp.building,
      unitTypeId: sp.unitType,
      includeArchived: sp.archived === "1",
    }),
    getGridLayout(actor),
    listBuildings(actor),
    listUnitTypes(actor),
  ]);
  const filtered = Boolean(sp.q || status || current || ending || sp.building || sp.unitType);
  const exportQuery = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  ).toString();

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
      <div className="mb-5 space-y-4">
        <SearchBox
          defaultValue={sp.q}
          placeholder="e.g. abc corp, 12A, LSE-2026-0004"
          keep={{ ...sp, q: undefined }}
        />
        <FilterChips
          label="Ending soon"
          options={[
            { value: "", label: "Any end date" },
            ...ENDING.map((d) => ({ value: d, label: `Expiring in ${d} days` })),
          ]}
          active={sp.ending && ENDING.includes(sp.ending) ? sp.ending : ""}
          hrefFor={(v) => withParams("/leases", sp, { ending: v || undefined })}
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <span
            className="text-muted-foreground inline-flex h-10 cursor-not-allowed items-center rounded-full border border-dashed px-4"
            title="Available once payments are added"
            aria-disabled="true"
          >
            Overdue (coming soon)
          </span>
        </div>
        <Suspense>
          <div className="flex flex-wrap gap-4">
            <FilterSelect
              param="building"
              label="Building"
              allLabel="All buildings"
              options={buildings.map((b) => ({ value: b.id, label: b.name }))}
            />
            <FilterSelect
              param="unitType"
              label="Unit type"
              allLabel="All unit types"
              options={unitTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        </Suspense>
      </div>

      {leases.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={filtered ? "No leases match" : "No leases yet"}
          action={
            !filtered && can(actor.role, "lease.edit") ? (
              <Button asChild>
                <Link href="/leases/new">Add your first lease →</Link>
              </Button>
            ) : null
          }
        >
          {filtered ? (
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
        <LeasesGrid
          rows={leases}
          layout={layout}
          exportQuery={exportQuery}
          can={{
            edit: can(actor.role, "lease.edit"),
            editTenant: can(actor.role, "tenant.edit"),
            archive: can(actor.role, "record.archive"),
            export: can(actor.role, "data.export"),
          }}
        />
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
