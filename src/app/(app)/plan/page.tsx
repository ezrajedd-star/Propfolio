import { AlertTriangle, Check, Lock, Mail } from "lucide-react";
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
import { formatDate, formatIsoDate } from "@/domain/time/manila";
import { FormAlert } from "@/components/form/form-alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canDo } from "@/server/auth/authorize";
import { requirePageUser } from "@/server/auth/current";
import { getSubscriptionView } from "@/server/subscription/service";
import { CancelButton, PlanButton } from "./plan-buttons";
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

type View = Awaited<ReturnType<typeof getSubscriptionView>>;

/** The button on a plan card, for the Owner. Null: no button. */
function planAction(
  p: PlanName,
  current: PlanName,
  view: View,
): { label: string; variant?: "outline" } | null {
  if (p === "FREE" || !view.canPayOnline) return null;
  const sub = view.subscription;
  if (sub?.status === "PAST_DUE")
    return p === sub.plan
      ? { label: "Pay now" }
      : { label: `Pay for ${PLAN_CONFIG[p].label}`, variant: "outline" };
  if (sub?.status === "ACTIVE") {
    if (p === sub.plan) {
      return sub.cancelAtPeriodEnd || sub.pendingPlan ? { label: "Keep this plan" } : null;
    }
    if (p === "PREMIUM") return { label: "Upgrade now" };
    if (sub.pendingPlan === p) return null;
    return { label: "Switch at the end of the month", variant: "outline" };
  }
  return {
    label: `Choose ${PLAN_CONFIG[p].label}`,
    variant: p === current ? undefined : "outline",
  };
}

function SubscriptionStatus({ view }: { view: View }) {
  const sub = view.subscription;
  if (!sub) return null;
  let text: string;
  if (sub.status === "PAST_DUE") {
    text = `This month's payment didn't go through. Pay by ${formatIsoDate(sub.graceEnds!)} to keep ${PLAN_CONFIG[sub.plan].label}; after that the account moves to Free (nothing is deleted).`;
  } else if (sub.status === "CANCELED") {
    text = "Your paid plan has ended. Choose a plan below to start again.";
  } else if (sub.cancelAtPeriodEnd) {
    text = `Cancelled: you keep ${PLAN_CONFIG[sub.plan].label} until ${formatIsoDate(sub.currentPeriodEnd)}, then the account moves to Free. Nothing more will be charged.`;
  } else if (sub.pendingPlan) {
    text = `From ${formatIsoDate(view.nextCharge!.date)} your plan will be ${PLAN_CONFIG[sub.pendingPlan].label}, at ${formatPeso(view.nextCharge!.amount)} a month.`;
  } else {
    text = `Paid until ${formatIsoDate(sub.currentPeriodEnd)}. Next charge: ${formatPeso(view.nextCharge!.amount)} on ${formatIsoDate(view.nextCharge!.date)}.`;
  }
  const warn = sub.status === "PAST_DUE";
  return (
    <div
      role="note"
      className={
        warn
          ? "border-warning bg-warning-soft text-warning mb-8 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          : "bg-card mb-8 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
      }
    >
      <p className="flex items-start gap-2">
        {warn ? <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden /> : null}
        {text}
      </p>
      {sub.status === "ACTIVE" && !sub.cancelAtPeriodEnd ? (
        <CancelButton
          plan={PLAN_CONFIG[sub.plan].label}
          until={formatIsoDate(sub.currentPeriodEnd)}
        />
      ) : null}
    </div>
  );
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const actor = await requirePageUser(undefined, { duringReadOnly: true });
  const s = await getPlanSummary(actor);
  const view = canDo(actor, "billing.manage") ? await getSubscriptionView(actor) : null;
  const { payment } = await searchParams;

  return (
    <>
      <PageHeader title="Plan" description={currentLine(s)} />
      {payment === "paid" ? (
        <FormAlert tone="success" className="mb-6 max-w-3xl">
          Payment received ✓ Thank you. A payment record is in the list below, and we&apos;ve
          emailed you a copy.
        </FormAlert>
      ) : payment === "failed" ? (
        <FormAlert className="mb-6 max-w-3xl">
          The payment didn&apos;t go through, so nothing was charged and your plan hasn&apos;t
          changed. You can try again below.
        </FormAlert>
      ) : null}
      {view ? <SubscriptionStatus view={view} /> : null}

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
                <CardContent className="space-y-5">
                  <ul className="space-y-2">
                    {PLAN_HIGHLIGHTS[p].map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                        {h}
                      </li>
                    ))}
                  </ul>
                  {view
                    ? (() => {
                        const a = planAction(p, s.plan, view);
                        return a && p !== "FREE" ? (
                          <PlanButton plan={p} label={a.label} variant={a.variant} />
                        ) : null;
                      })()
                    : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {view && view.payments.length > 0 ? (
        <>
          <h2 className="mb-4 text-xl font-semibold">Payments</h2>
          <Card className="mb-10 max-w-3xl overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.payments.map((p) => (
                  <TableRow key={p.number}>
                    <TableCell>{formatDate(p.issuedAt)}</TableCell>
                    <TableCell className="tabular-nums">{p.number}</TableCell>
                    <TableCell className="whitespace-normal">{p.description}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="text-muted-foreground -mt-8 mb-10 max-w-3xl text-sm">
            Payment records, not official receipts.
          </p>
        </>
      ) : null}

      {view?.canPayOnline ? null : (
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
      )}
    </>
  );
}
