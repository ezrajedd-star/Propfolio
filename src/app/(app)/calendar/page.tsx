import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Calendar" };

export default async function Page() {
  await requirePageUser("occupancy.view");
  return (
    <ComingSoon
      title="Calendar"
      description="Lease start and end dates, reminders and rent due dates in month, week and list views."
      what="The calendar arrives in Phase 3, once leases can be added."
    />
  );
}
