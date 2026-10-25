import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { can } from "@/domain/auth/roles";
import { isIsoDate } from "@/domain/time/calendar-date";
import { requirePageUser } from "@/server/auth/current";
import { listBuildings } from "@/server/property/buildings";
import { listUnitTypes } from "@/server/property/unit-types";
import { CalendarLoader } from "./calendar-loader";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requirePageUser("occupancy.view");
  const { date } = await searchParams;
  const [buildings, unitTypes] = await Promise.all([listBuildings(actor), listUnitTypes(actor)]);
  const staff = can(actor.role, "lease.view");
  return (
    <>
      <PageHeader
        title="Calendar"
        description={
          staff
            ? "Lease end dates, reminders and start dates. Click any item to see the lease."
            : "Lease start and end dates for every unit."
        }
      />
      <CalendarLoader
        buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
        unitTypes={unitTypes.map((t) => ({ id: t.id, name: t.name }))}
        staff={staff}
        initialDate={date && isIsoDate(date) ? date : undefined}
      />
    </>
  );
}
