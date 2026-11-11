import { Briefcase, Building, Calculator, Gift } from "lucide-react";
import type { Metadata } from "next";

import { PlaceholderBadge, Section } from "@/components/marketing/section";
import { PARTNER_PROGRAMME as P } from "@/domain/marketing/pages";
import { PartnerForm } from "./partner-form";

export const metadata: Metadata = {
  title: "Partners and referrals",
  description: "For brokers, property managers and accountants who work with Philippine lessors.",
};

const ICONS = [Briefcase, Building, Calculator];

export default function PartnersPage() {
  return (
    <>
      <section className="from-primary-soft bg-gradient-to-b to-transparent px-4 pt-14 pb-6 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Partners</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Help the lessors you work with, and be rewarded for it
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          For brokers, property managers and accountants who want their clients&apos; leases in
          order.
        </p>
      </section>

      <Section title="Who it's for.">
        <div className="grid gap-4 md:grid-cols-3">
          {P.who.map((w, i) => {
            const Icon = ICONS[i] ?? Briefcase;
            return (
              <div key={w.title} className="rounded-2xl border p-6">
                <Icon className="text-primary size-6" aria-hidden />
                <h3 className="mt-3 text-xl font-semibold">{w.title}</h3>
                <p className="text-muted-foreground mt-2">{w.text}</p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section className="bg-muted/40" title="How it works.">
        <div className="grid gap-6 lg:grid-cols-2">
          <ol className="space-y-4">
            {P.steps.map((s, i) => (
              <li
                key={s}
                className="bg-card flex items-center gap-4 rounded-2xl border p-5 text-lg"
              >
                <span className="bg-primary text-primary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-full font-semibold">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <div className="bg-card rounded-2xl border p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Gift className="text-primary size-6" aria-hidden />
              <h3 className="text-xl font-semibold">What you get</h3>
              <PlaceholderBadge />
            </div>
            <p className="text-muted-foreground mt-3 text-lg">{P.offer}</p>
          </div>
        </div>
      </Section>

      <Section id="apply" className="scroll-mt-20">
        <div className="mx-auto max-w-3xl rounded-3xl border p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Apply to partner</h2>
          <p className="text-muted-foreground mt-1 mb-6">
            It takes a minute. We reply within one working day.
          </p>
          <PartnerForm />
        </div>
      </Section>
    </>
  );
}
