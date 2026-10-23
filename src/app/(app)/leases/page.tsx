import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Leases" };

export default async function Page() {
  await requirePageUser("lease.view");
  return (
    <ComingSoon
      title="Leases"
      description="Every lease in one spreadsheet-style list you can search, filter and export."
      what="The leases grid arrives in Phase 3. Adding leases arrives in Phase 2."
    />
  );
}
