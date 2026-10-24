import type { Metadata } from "next";
import Link from "next/link";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { listBuildings } from "@/server/property/buildings";
import { BuildingsList } from "./buildings-list";

export const metadata: Metadata = { title: "Buildings and units" };

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const actor = await requirePageUser("property.manage");
  const { archived } = await searchParams;
  const buildings = await listBuildings(actor, { includeArchived: archived === "1" });
  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Buildings and units"
        description="Add buildings, then the units inside them. Archived buildings are hidden but kept."
      />
      <BuildingsList buildings={buildings} />
      <p className="mt-6">
        <Link
          href={archived === "1" ? "/settings/buildings" : "/settings/buildings?archived=1"}
          className="text-primary hover:underline"
        >
          {archived === "1" ? "Hide archived buildings" : "Show archived buildings"}
        </Link>
      </p>
    </>
  );
}
