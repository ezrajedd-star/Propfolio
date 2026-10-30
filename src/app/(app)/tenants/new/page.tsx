import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { TaskTourButton } from "@/components/app/guide";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { renderPrivacyNotice } from "@/schemas/settings";
import { requirePageUser } from "@/server/auth/current";
import { getSettings } from "@/server/settings/service";
import { NewTenantPageForm } from "./new-tenant-page-form";

export const metadata: Metadata = { title: "Add tenant" };

export default async function NewTenantPage() {
  await requirePageUser("tenant.edit");
  const settings = await getSettings();
  return (
    <>
      <BackLink href="/tenants">Tenants</BackLink>
      <PageHeader
        title="Add a tenant"
        description="Only the display name is required. Add the rest when you have it."
        actions={<TaskTourButton id="add-tenant" />}
      />
      <Card className="max-w-3xl">
        <CardContent>
          <NewTenantPageForm privacyNotice={renderPrivacyNotice(settings)} />
        </CardContent>
      </Card>
    </>
  );
}
