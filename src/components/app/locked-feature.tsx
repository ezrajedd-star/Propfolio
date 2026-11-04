import { Gem, Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FEATURE_DESCRIPTIONS, availableOnMessage, type Feature } from "@/domain/plans/plans";

/** In place of a feature the account's plan doesn't include: what it would add, and Upgrade. */
export function LockedFeature({ feature }: { feature: Feature }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <p className="flex items-center gap-2 font-semibold">
        <Lock className="text-primary size-5" aria-hidden /> {availableOnMessage(feature)}
      </p>
      <p className="text-muted-foreground max-w-xl">{FEATURE_DESCRIPTIONS[feature]}</p>
      <Button asChild>
        <Link href="/plan">
          <Gem aria-hidden /> Upgrade
        </Link>
      </Button>
    </div>
  );
}
