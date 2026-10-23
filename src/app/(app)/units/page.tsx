import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Units" };

export default async function Page() {
  await requirePageUser("occupancy.view");
  return (
    <ComingSoon
      title="Units"
      description="Units by building, with who is in them and when their lease ends."
      what="Buildings and units arrive in Phase 2."
    />
  );
}
