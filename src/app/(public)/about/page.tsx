import { HeartHandshake, MapPin, Sparkles, Target } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { PlaceholderBadge, Section } from "@/components/marketing/section";
import { COMPANY } from "@/domain/legal/company";

export const metadata: Metadata = {
  title: "About us",
  description: "Why we built Propfolio, the lease ledger for Philippine lessors.",
};

const VALUES = [
  {
    icon: Target,
    title: "Simple beats clever",
    text: "Plain words, big buttons and one clear next step. If it needs a manual, we haven't finished it.",
  },
  {
    icon: HeartHandshake,
    title: "Your data is yours",
    text: "Export everything, any time, on every plan. We never sell or share it.",
  },
  {
    icon: Sparkles,
    title: "Exact, always",
    text: "Money to the centavo, dates in Manila time, and a record of every change.",
  },
  {
    icon: MapPin,
    title: "Made for here",
    text: "Pesos, GCash and Maya, the Data Privacy Act and the way Philippine leases really work.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-6 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">About us</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            We built the lease ledger we wished we had
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Propfolio started inside a Philippine leasing company, where renewals were tracked in a
            spreadsheet and remembered by whoever happened to look. A few missed dates later, we
            built something better, and now we&apos;re opening it up to every lessor.
          </p>
        </div>
      </section>

      <Section>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border p-8">
            <h2 className="text-2xl font-semibold">Our mission</h2>
            <p className="text-muted-foreground mt-3 text-lg">
              Help every Philippine lessor, from a family with five apartments to a company with two
              hundred warehouses, keep every lease on time, every peso right and every tenant&apos;s
              data safe.
            </p>
          </div>
          <div className="rounded-3xl border p-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">Our story</h2>
              <PlaceholderBadge />
            </div>
            <p className="text-muted-foreground mt-3 text-lg">
              [PLACEHOLDER: the founder&apos;s story in a few sentences: the company, the moment a
              missed renewal cost money, and why Propfolio exists.]
            </p>
          </div>
        </div>
      </Section>

      <Section className="bg-muted/40" eyebrow="What we believe" title="Four promises.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.title} className="bg-card rounded-2xl border p-6">
              <v.icon className="text-primary size-6" aria-hidden />
              <h3 className="mt-3 text-xl font-semibold">{v.title}</h3>
              <p className="text-muted-foreground mt-2">{v.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="The team" title="The people behind Propfolio.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["Founder", "Product and engineering", "Customer success"].map((role) => (
            <div key={role} className="rounded-2xl border p-6">
              <div
                aria-hidden
                className="bg-primary-soft text-primary flex size-16 items-center justify-center rounded-full text-xl font-semibold"
              >
                ?
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold">[Name]</h3>
                <PlaceholderBadge />
              </div>
              <p className="text-muted-foreground">{role}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="bg-muted/40" title="Company details.">
        <dl className="bg-card divide-y rounded-2xl border">
          {(
            [
              ["Business name", COMPANY.legalName],
              ["Registration", COMPANY.registration],
              ["Address", COMPANY.address],
              ["Hours", COMPANY.hours],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium sm:col-span-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <CtaBand />
    </>
  );
}
