import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { OccupancyBar } from "@/components/app/occupancy-bar";
import { TaskTourButton } from "@/components/app/guide";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BUILDING_TYPE_LABELS } from "@/schemas/property";
import { requirePageUser } from "@/server/auth/current";
import { listBuildings } from "@/server/property/buildings";
import { listUnitTypes } from "@/server/property/unit-types";
import { listUnits } from "@/server/property/units";
import { EditBuildingButton } from "./edit-building-button";
import { UnitsManager } from "./units-manager";

export const metadata: Metadata = { title: "Building" };

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("property.manage");
  const { id } = await params;
  const building = (await listBuildings(actor, { includeArchived: true })).find((b) => b.id === id);
  if (!building) notFound();
  const [units, unitTypes] = await Promise.all([
    listUnits(actor, { buildingId: id, includeArchived: true }),
    listUnitTypes(actor),
  ]);

  return (
    <>
      <BackLink href="/settings/buildings">Buildings and units</BackLink>
      <PageHeader
        title={building.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{building.code}</Badge> {BUILDING_TYPE_LABELS[building.type]} ·{" "}
            {building.address}
            {building.archived ? <Badge variant="neutral">Archived</Badge> : null}
          </span>
        }
        actions={
          <>
            <TaskTourButton id="add-units" />
            <EditBuildingButton building={{ ...building, notes: building.notes ?? "" }} />
          </>
        }
      />
      <Card className="mb-8">
        <CardContent>
          <OccupancyBar counts={building.occupancy} />
        </CardContent>
      </Card>
      <UnitsManager
        buildingId={id}
        units={units.filter((u) => u.building.id === id)}
        unitTypes={unitTypes}
      />
    </>
  );
}
