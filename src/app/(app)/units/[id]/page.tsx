import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { DetailList } from "@/components/app/detail-list";
import { LeaseStatusBadge, OccupancyBadge } from "@/components/app/lease-badges";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/auth/roles";
import { formatDuration } from "@/domain/time/calendar-date";
import { timeLeftText } from "@/domain/leases/status";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { getUnit } from "@/server/property/units";
import { UnitRemindersCard } from "./unit-reminders-card";

export const metadata: Metadata = { title: "Unit" };

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageUser("occupancy.view");
  const { id } = await params;
  const unit = await getUnit(actor, id);
  const staff = can(actor.role, "lease.edit");
  const today = manilaToday();
  const current = unit.currentLease;

  return (
    <>
      <BackLink href="/units">Units</BackLink>
      <PageHeader
        title={`Unit ${unit.unitNumber}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {unit.building.name} · {unit.unitType.name}{" "}
            <OccupancyBadge occupancy={unit.occupancy} />
          </span>
        }
        actions={
          staff && !unit.archived && unit.occupancy !== "OCCUPIED" ? (
            <Button asChild>
              <Link href={`/leases/new?unit=${unit.id}`}>
                <FilePlus2 aria-hidden /> New lease for this unit
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current lease</CardTitle>
          </CardHeader>
          <CardContent>
            {current ? (
              <DetailList
                items={[
                  { label: "Tenant", value: current.tenantName },
                  { label: "Start", value: formatIsoDate(current.startDate) },
                  {
                    label: "End",
                    value: formatIsoDate(current.terminationDate ?? current.endDate),
                  },
                  {
                    label: "Time left",
                    value: timeLeftText({ ...current, renewed: false }, today),
                  },
                  ...(current.lease
                    ? [
                        {
                          label: "Lease",
                          value: (
                            <Link
                              href={`/leases/${current.lease.id}`}
                              className="text-primary underline"
                            >
                              {current.lease.refNo}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <p className="text-muted-foreground">
                No current lease.
                {unit.nextLease
                  ? ` ${unit.nextLease.tenantName} moves in on ${formatIsoDate(unit.nextLease.startDate)}.`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: "Building", value: unit.building.name },
                { label: "Type", value: unit.unitType.name },
                { label: "Floor", value: unit.floor },
                {
                  label: "Floor area",
                  value: unit.floorArea
                    ? `${Number(unit.floorArea).toLocaleString("en-PH")} sqm`
                    : null,
                },
                { label: "Standalone", value: unit.isStandalone ? "Yes" : "No" },
                ...(staff ? [{ label: "Notes", value: unit.notes }] : []),
              ]}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lease history</CardTitle>
          </CardHeader>
          <CardContent>
            {unit.history.length === 0 ? (
              <p className="text-muted-foreground">This unit hasn&apos;t been leased yet.</p>
            ) : (
              <ol className="divide-y">
                {unit.history.map((h, i) => (
                  <li
                    key={h.lease?.id ?? i}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
                  >
                    <span className="min-w-48 font-medium">{h.tenantName}</span>
                    <span className="text-muted-foreground">
                      {formatIsoDate(h.startDate)} – {formatIsoDate(h.terminationDate ?? h.endDate)}{" "}
                      ({formatDuration(h.startDate, h.terminationDate ?? h.endDate)})
                    </span>
                    {h.lease ? (
                      <>
                        <LeaseStatusBadge status={h.lease.status} />
                        <Link href={`/leases/${h.lease.id}`} className="text-primary underline">
                          {h.lease.refNo}
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        {staff ? (
          <div className="lg:col-span-2">
            <UnitRemindersCard
              unitId={unit.id}
              unitTypeName={unit.unitType.name}
              effective={unit.reminders.effective}
              source={unit.reminders.source}
              inherited={unit.reminders.unitTypeConfig ?? unit.reminders.systemDefault}
              canEdit={can(actor.role, "property.manage")}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
