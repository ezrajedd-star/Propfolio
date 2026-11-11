import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { PlanCards } from "@/components/marketing/plan-cards";
import { PlanPicker } from "@/components/marketing/plan-picker";
import { Section } from "@/components/marketing/section";
import { FAQ } from "@/domain/marketing/content";
import { formatPeso } from "@/domain/money/money";
import {
  FEATURES,
  FEATURE_LABELS,
  FEATURE_PLAN,
  PLANS,
  PLAN_CONFIG,
  TRIAL_DAYS,
  type PlanName,
} from "@/domain/plans/plans";
import { GRACE_DAYS } from "@/domain/subscription/subscription";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Propfolio plans: Free, Pro and Premium, in Philippine pesos. Lease management for Philippine lessors.",
};

/** On every plan (from the brief): what Free already includes. */
const EVERY_PLAN = [
  "Buildings, units, tenants and occupancy",
  "Leases, the calendar and the spreadsheet-style table",
  "Daily reminder email",
  "Rent schedules, escalations, deposits and advance rent",
  "Excel import and export",
  "Data Privacy Act tools",
  "Two-step sign-in",
];

const rank = (p: PlanName) => PLANS.indexOf(p);

/** Pricing, straight from the plan configuration (the same numbers the app enforces). */
export default function PricingPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-6 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Pricing</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Simple monthly plans
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Every new account gets Premium free for {TRIAL_DAYS} days. No card needed. Prices are in
          Philippine pesos; no setup fees, no long contracts.
        </p>
      </section>

      <Section className="pt-6">
        <PlanCards />
      </Section>

      <Section
        className="bg-muted/40"
        eyebrow="Not sure?"
        title="Find your plan in ten seconds."
        lead="Move the sliders. We'll suggest the plan that fits."
      >
        <PlanPicker />
      </Section>

      <Section eyebrow="Compare" title="Everything, side by side.">
        <div className="relative overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[560px] text-left">
            <caption className="sr-only">What each plan includes</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="p-4 font-semibold">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th key={p} scope="col" className="p-4 text-center font-semibold">
                    {PLAN_CONFIG[p].label}
                    <span className="text-muted-foreground block text-sm font-normal">
                      {formatPeso(PLAN_CONFIG[p].pricePerMonth)} a month
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <th scope="row" className="p-4 font-normal">
                  Units
                </th>
                {PLANS.map((p) => (
                  <td key={p} className="p-4 text-center font-semibold">
                    Up to {PLAN_CONFIG[p].units}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-4 font-normal">
                  People who can sign in
                </th>
                {PLANS.map((p) => (
                  <td key={p} className="p-4 text-center font-semibold">
                    {PLAN_CONFIG[p].users === 1 ? "1" : `Up to ${PLAN_CONFIG[p].users}`}
                  </td>
                ))}
              </tr>
              {EVERY_PLAN.map((f) => (
                <tr key={f}>
                  <th scope="row" className="p-4 font-normal">
                    {f}
                  </th>
                  {PLANS.map((p) => (
                    <td key={p} className="p-4 text-center">
                      <Yes />
                    </td>
                  ))}
                </tr>
              ))}
              {FEATURES.map((f) => (
                <tr key={f}>
                  <th scope="row" className="p-4 font-normal">
                    {FEATURE_LABELS[f]}
                  </th>
                  {PLANS.map((p) => (
                    <td key={p} className="p-4 text-center">
                      {rank(p) >= rank(FEATURE_PLAN[f]) ? <Yes /> : <No />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="bg-muted/40" eyebrow="Billing" title="How paying works.">
        <ul className="grid gap-4 md:grid-cols-2">
          {[
            "Pay monthly by card, GCash or Maya on our payment partner's secure page.",
            "Upgrading applies straight away; you pay the difference for the rest of the month.",
            "Downgrading or cancelling applies at the end of the month you paid for.",
            `If a monthly payment fails, you keep your plan for ${GRACE_DAYS} more days while you update it.`,
            `When a trial or paid plan ends, nothing is deleted: the account moves to Free. Over ${PLAN_CONFIG.FREE.units} units, it becomes read-only until you upgrade.`,
          ].map((t) => (
            <li key={t} className="bg-card flex gap-3 rounded-2xl border p-5">
              <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
              {t}
            </li>
          ))}
          <li className="bg-card flex gap-3 rounded-2xl border p-5">
            <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              Over {PLAN_CONFIG.PREMIUM.units} units?{" "}
              <Link href="/contact" className="text-primary underline underline-offset-4">
                Contact us
              </Link>{" "}
              about a larger plan. See also{" "}
              <Link href="/legal/refunds" className="text-primary underline underline-offset-4">
                refunds and cancellation
              </Link>
              .
            </span>
          </li>
        </ul>
      </Section>

      <Section eyebrow="Questions" title="About plans and payments.">
        <div className="max-w-3xl">
          <FaqList items={FAQ.filter((f) => f.category === "Plans and payments")} />
        </div>
      </Section>

      <CtaBand title="Try Premium free for 30 days." />
    </>
  );
}

function Yes() {
  return (
    <span className="text-primary inline-flex items-center gap-1">
      <Check className="size-5" aria-hidden />
      <span className="sr-only">Included</span>
    </span>
  );
}

function No() {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1">
      <Minus className="size-5" aria-hidden />
      <span className="sr-only">Not included</span>
    </span>
  );
}
