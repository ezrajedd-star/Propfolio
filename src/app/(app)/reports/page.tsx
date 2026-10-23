import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Reports" };

export default async function Page() {
  await requirePageUser("report.view");
  return (
    <ComingSoon
      title="Reports"
      description="Expiry pipeline, occupancy, rent roll, collections and more — all exportable."
      what="Reports arrive in Phase 6."
    />
  );
}
