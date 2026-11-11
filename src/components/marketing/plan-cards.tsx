import { Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatPeso } from "@/domain/money/money";
import { PLANS, PLAN_CONFIG, PLAN_HIGHLIGHTS, type PlanName } from "@/domain/plans/plans";
import { cn } from "@/lib/utils";

const TAGLINES: Record<PlanName, string> = {
  FREE: "For a few units, free for as long as you like.",
  PRO: "For a growing portfolio, run by one person.",
  PREMIUM: "For a team, with documents and an audit log.",
};

/** The three plans, straight from the plan configuration (the numbers the app enforces). */
export function PlanCards({ highlight }: { highlight?: PlanName }) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {PLANS.map((p) => {
        const c = PLAN_CONFIG[p];
        const featured = p === "PRO";
        const picked = highlight === p;
        return (
          <li key={p}>
            <div
              className={cn(
                "bg-card relative flex h-full flex-col rounded-2xl border p-6 transition-all",
                featured && "border-primary border-2",
                picked && "ring-primary/30 shadow-lg ring-4",
              )}
            >
              {featured ? (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-3 py-0.5 text-sm font-semibold">
                  Most popular
                </span>
              ) : null}
              <h3 className="text-xl font-semibold">{c.label}</h3>
              <p className="text-muted-foreground mt-1">{TAGLINES[p]}</p>
              <p className="mt-5 text-4xl font-semibold tracking-tight">
                {formatPeso(c.pricePerMonth)}
                <span className="text-muted-foreground text-base font-normal"> a month</span>
              </p>
              <p className="text-muted-foreground mt-1">
                Up to {c.units} units · {c.users === 1 ? "1 user" : `up to ${c.users} users`}
              </p>
              <Button
                asChild
                className="mt-6 w-full"
                size="lg"
                variant={featured ? "default" : "outline"}
              >
                <Link href="/signup">Start free</Link>
              </Button>
              <ul className="mt-6 space-y-2">
                {PLAN_HIGHLIGHTS[p].map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
