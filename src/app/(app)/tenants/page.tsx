import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Tenants" };

export default async function Page() {
  await requirePageUser("tenant.view");
  return (
    <ComingSoon
      title="Tenants"
      description="Tenant contact details, their leases and balances."
      what="Tenants arrive in Phase 2."
    />
  );
}
