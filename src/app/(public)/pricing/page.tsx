import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeso } from "@/domain/money/money";
import { PLANS, PLAN_CONFIG, PLAN_HIGHLIGHTS, TRIAL_DAYS } from "@/domain/plans/plans";
import { GRACE_DAYS } from "@/domain/subscription/subscription";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Propfolio plans: Free, Pro and Premium. Lease management for Philippine lessors.",
};

/** Pricing, straight from the plan configuration (the same numbers the app enforces). */
export default function PricingPage() {
  return (
    <>
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">Simple monthly plans</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Every new account gets Premium free for {TRIAL_DAYS} days. No card needed. Prices are in
          Philippine pesos.
        </p>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const c = PLAN_CONFIG[p];
          return (
            <li key={p}>
              <Card className={p === "PRO" ? "border-primary h-full border-2" : "h-full"}>
                <CardHeader>
                  <CardTitle>{c.label}</CardTitle>
                  <p className="text-3xl font-semibold">
                    {formatPeso(c.pricePerMonth)}
                    <span className="text-muted-foreground text-base font-normal"> a month</span>
                  </p>
                  <p className="text-muted-foreground">
                    Up to {c.units} units · {c.users === 1 ? "1 user" : `up to ${c.users} users`}
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <ul className="space-y-2">
                    {PLAN_HIGHLIGHTS[p].map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="w-full" variant={p === "PRO" ? "default" : "outline"}>
                    <Link href="/signup">Start free</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <section className="mx-auto mt-12 max-w-2xl space-y-3">
        <h2 className="text-xl font-semibold">How paying works</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Pay monthly by card, GCash or Maya on our payment partner&apos;s secure page.</li>
          <li>
            Upgrading applies straight away; you pay the difference for the rest of the month.
          </li>
          <li>Downgrading or cancelling applies at the end of the month you paid for.</li>
          <li>
            If a monthly payment fails, you keep your plan for {GRACE_DAYS} more days while you
            update it.
          </li>
          <li>
            When a trial or paid plan ends, nothing is deleted: the account moves to Free. Over{" "}
            {PLAN_CONFIG.FREE.units} units, it becomes read-only until you upgrade.
          </li>
          <li>
            Over {PLAN_CONFIG.PREMIUM.units} units?{" "}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              Contact us
            </Link>{" "}
            for a larger plan.
          </li>
        </ul>
        <p className="text-muted-foreground">
          See also our{" "}
          <Link href="/legal/refunds" className="text-primary underline underline-offset-4">
            refund and cancellation policy
          </Link>
          .
        </p>
      </section>
    </>
  );
}
