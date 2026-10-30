import { Building2, DoorOpen, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, withParams } from "@/components/app/filter-chips";
import { OccupancyBadge } from "@/components/app/lease-badges";
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
import type { Occupancy } from "@/domain/leases/occupancy";
import { timeLeftText } from "@/domain/leases/status";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { listBuildings } from "@/server/property/buildings";
import { listUnits, type UnitSummary } from "@/server/property/units";

export const metadata: Metadata = { title: "Units" };

type Search = { q?: string; building?: string; show?: string };

const SHOW: { value: string; label: string; occupancy?: Occupancy }[] = [
  { value: "", label: "All units" },
  { value: "vacant", label: "Vacant", occupancy: "VACANT" },
  { value: "occupied", label: "Occupied", occupancy: "OCCUPIED" },
  { value: "renovation", label: "Under renovation", occupancy: "UNDER_RENOVATION" },
  { value: "unavailable", label: "Unavailable", occupancy: "UNAVAILABLE" },
];

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePageUser("occupancy.view");
  const sp = await searchParams;
  const show = SHOW.find((s) => s.value === (sp.show ?? "")) ?? SHOW[0]!;
  const [units, buildings] = await Promise.all([
    listUnits(actor, { q: sp.q, buildingId: sp.building, occupancy: show.occupancy }),
    listBuildings(actor),
  ]);
  const today = manilaToday();
  const staff = can(actor.role, "lease.view");

  const groups = new Map<string, { name: string; units: UnitSummary[] }>();
  for (const u of units) {
    const g = groups.get(u.building.id) ?? { name: u.building.name, units: [] };
    g.units.push(u);
    groups.set(u.building.id, g);
  }

  return (
    <>
      <PageHeader
        title="Units"
        description={
          staff
            ? "Every unit, who is in it, and when their lease ends."
            : "Every unit and whether it is occupied. Read-only."
        }
        actions={
          can(actor.role, "property.manage") ? (
            <Button asChild>
              <Link href="/settings/buildings">
                <Plus aria-hidden /> Add a building or units
              </Link>
            </Button>
          ) : staff ? (
            <span className="text-muted-foreground text-sm">
              New building or units? Ask an Admin to add them.
            </span>
          ) : null
        }
      />
      <div className="mb-6 space-y-4">
        <SearchBox
          defaultValue={sp.q}
          placeholder={staff ? "Unit, building or tenant" : "Unit or building"}
          keep={{ building: sp.building, show: sp.show }}
        />
        <FilterChips
          label="Show"
          options={SHOW}
          active={show.value}
          hrefFor={(v) => withParams("/units", sp, { show: v || undefined })}
        />
        {buildings.length > 1 ? (
          <FilterChips
            label="Building"
            options={[
              { value: "", label: "All buildings" },
              ...buildings.map((b) => ({ value: b.id, label: b.name })),
            ]}
            active={sp.building ?? ""}
            hrefFor={(v) => withParams("/units", sp, { building: v || undefined })}
          />
        ) : null}
      </div>

      {units.length === 0 ? (
        buildings.length === 0 ? (
          <EmptyState icon={Building2} title="No buildings or units yet">
            {can(actor.role, "property.manage") ? (
              <Link href="/settings/buildings" className="text-primary underline">
                Add your first building →
              </Link>
            ) : (
              "An Admin needs to add buildings and units first."
            )}
          </EmptyState>
        ) : (
          <EmptyState icon={DoorOpen} title="No units match">
            Try another search or{" "}
            <Link href="/units" className="text-primary underline">
              show all units
            </Link>
            .
          </EmptyState>
        )
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([id, g]) => (
            <section key={id} aria-labelledby={`b-${id}`}>
              <h2 id={`b-${id}`} className="mb-3 text-lg font-semibold">
                {g.name}{" "}
                <span className="text-muted-foreground font-normal">· {g.units.length}</span>
              </h2>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Unit</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Occupancy</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Lease ends</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.units.map((u) => {
                      const lease = u.currentLease;
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/units/${u.id}`}
                              className="text-primary inline-flex min-h-10 items-center hover:underline"
                            >
                              {u.unitNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{u.unitType.name}</TableCell>
                          <TableCell>
                            <OccupancyBadge occupancy={u.occupancy} />
                          </TableCell>
                          <TableCell>
                            {lease ? (
                              lease.tenantName
                            ) : u.nextLease ? (
                              <span className="text-muted-foreground">
                                Next: {u.nextLease.tenantName}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {lease ? (
                              <>
                                <div>{formatIsoDate(lease.terminationDate ?? lease.endDate)}</div>
                                <div className="text-muted-foreground text-sm">
                                  {timeLeftText({ ...lease, renewed: false }, today)}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
