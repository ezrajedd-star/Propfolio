import { Check, Lock, Mail } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeso } from "@/domain/money/money";
import {
  PLANS,
  PLAN_CONFIG,
  PLAN_HIGHLIGHTS,
  READ_ONLY_MESSAGE,
  type PlanName,
} from "@/domain/plans/plans";
import { formatIsoDate } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { getPlanSummary } from "@/server/plans/summary";

export const metadata: Metadata = { title: "Plan" };

function currentLine(s: Awaited<ReturnType<typeof getPlanSummary>>): string {
  const label = PLAN_CONFIG[s.plan].label;
  if (s.trial && s.trialLastDay) {
    const left = s.trial.daysLeft === 1 ? "1 day" : `${s.trial.daysLeft} days`;
    return `You're on a free Premium trial: ${left} left (until ${formatIsoDate(s.trialLastDay)}). When it ends, your account moves to Free and nothing is deleted.`;
  }
  if (s.lapsed) {
    return `Your trial or paid period has ended, so your account is on Free. Nothing was deleted: upgrade to get everything back straight away.`;
  }
  return `Your account is on the ${label} plan.`;
}

function usage(used: number, limit: number) {
  return `${used} of ${limit}`;
}

export default async function PlanPage() {
  const actor = await requirePageUser();
  const s = await getPlanSummary(actor);

  return (
    <>
      <PageHeader title="Plan" description={currentLine(s)} />

      {s.readOnly ? (
        <div
          role="note"
          className="border-warning bg-warning-soft text-warning mb-8 flex max-w-3xl gap-3 rounded-lg border p-4"
        >
          <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{READ_ONLY_MESSAGE}</p>
        </div>
      ) : null}

      <Card className="mb-8 max-w-3xl">
        <CardContent>
          <dl className="divide-y">
            {(
              [
                ["Plan", PLAN_CONFIG[s.plan].label + (s.trial ? " (free trial)" : "")],
                ["Units in use", usage(s.units.used, s.units.limit)],
                ["People who can sign in", usage(s.usersUsed, s.users.limit)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium sm:col-span-2">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <h2 className="mb-4 text-xl font-semibold">Compare plans</h2>
      <ul className="mb-10 grid gap-4 md:grid-cols-3">
        {PLANS.map((p: PlanName) => {
          const c = PLAN_CONFIG[p];
          const current = p === s.plan;
          return (
            <li key={p}>
              <Card className={current ? "border-primary h-full border-2" : "h-full"}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{c.label}</CardTitle>
                    {current ? <Badge>Your plan</Badge> : null}
                  </div>
                  <p className="text-2xl font-semibold">
                    {formatPeso(c.pricePerMonth)}
                    <span className="text-muted-foreground text-base font-normal"> a month</span>
                  </p>
                  <p className="text-muted-foreground">
                    Up to {c.units} units · {c.users === 1 ? "1 user" : `up to ${c.users} users`}
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {PLAN_HIGHLIGHTS[p].map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                        {h}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>How to upgrade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {s.canChangePlan ? (
            <>
              <p>
                Paying online by card, Maya or GCash is coming soon. For now, write to us and we
                will switch your plan the same working day. Upgrading gives you everything back
                straight away.
              </p>
              {s.supportEmail ? (
                <Button asChild>
                  <a
                    href={`mailto:${s.supportEmail}?subject=${encodeURIComponent("Upgrade my Propfolio plan")}`}
                  >
                    <Mail aria-hidden /> Email {s.supportEmail}
                  </a>
                </Button>
              ) : null}
            </>
          ) : (
            <p>Only your account&apos;s Owner can change the plan. Ask them if you need more.</p>
          )}
          <p className="text-muted-foreground">
            Over {PLAN_CONFIG.PREMIUM.units} units? Contact us for a larger plan.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
