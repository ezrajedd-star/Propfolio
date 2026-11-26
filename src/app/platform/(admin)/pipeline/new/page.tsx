import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePlatformPage } from "@/server/platform/current";
import { listStaffNames } from "@/server/platform/staff";
import { BLANK_LEAD, LeadForm } from "../lead-form";

export const metadata: Metadata = { title: "Add a lead" };

export default async function NewLeadPage() {
  const admin = await requirePlatformPage("pipeline.manage");
  const staff = await listStaffNames(admin);
  return (
    <>
      <BackLink href="/platform/pipeline">Pipeline</BackLink>
      <PageHeader title="Add a lead" />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <LeadForm initial={{ ...BLANK_LEAD, ownerId: admin.id }} staff={staff} />
        </CardContent>
      </Card>
    </>
  );
}
