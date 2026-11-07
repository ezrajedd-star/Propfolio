import type { Metadata } from "next";

import { BackLink } from "@/components/app/back-link";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Import from Excel" };

export default async function ImportPage() {
  await requirePageUser("property.manage");
  await requirePageUser("lease.edit");
  return (
    <>
      <BackLink href="/settings">Settings</BackLink>
      <PageHeader
        title="Import from Excel"
        description="Add many buildings, units, tenants and leases at once. You'll see every problem before anything is saved."
      />
      <ImportFlow />
    </>
  );
}
