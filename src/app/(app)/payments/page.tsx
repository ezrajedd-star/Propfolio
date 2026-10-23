import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Payments" };

export default async function Page() {
  await requirePageUser("payment.view");
  return (
    <ComingSoon
      title="Payments"
      description="Record payments and see who is overdue."
      what="Payments arrive in Phase 5."
    />
  );
}
