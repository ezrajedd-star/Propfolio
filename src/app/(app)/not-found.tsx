import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="We couldn't find that"
      action={
        <Button asChild>
          <Link href="/">Go to Home</Link>
        </Button>
      }
    >
      It may have been archived, or the link is incomplete. Try searching from Leases, Tenants or
      Units.
    </EmptyState>
  );
}
