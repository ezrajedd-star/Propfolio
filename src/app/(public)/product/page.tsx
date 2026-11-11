import { Check } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { FEATURE_ICONS } from "@/components/marketing/feature-icons";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { FEATURES, SEGMENTS } from "@/domain/marketing/content";
import { FEATURE_PLAN, PLAN_CONFIG, type Feature } from "@/domain/plans/plans";

export const metadata: Metadata = {
  title: "Product",
  description:
    "Lease reminders, rent schedules, payments, reports and Data Privacy Act tools for Philippine lessors.",
};

/** Which plan a website feature starts on (most are on every plan). */
const PLAN_OF: Partial<Record<(typeof FEATURES)[number]["key"], Feature>> = {
  payments: "payments",
  reports: "reports",
  documents: "documents",
  teams: "team",
  audit: "auditLog",
};

export default function ProductPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-10 sm:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">Product</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Every lease, every peso, every date. In one place.
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">
              Propfolio replaces the lease spreadsheet, the calendar reminders and the rent
              calculator with one simple tool your whole team can use.
            </p>
            <nav aria-label="Features on this page" className="mt-8 flex flex-wrap gap-2">
              {FEATURES.map((f) => (
                <a
                  key={f.key}
                  href={`#${f.key}`}
                  className="hover:border-primary hover:text-primary inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors"
                >
                  {f.title.split(" ").slice(0, 3).join(" ")}
                </a>
              ))}
            </nav>
          </div>
          <ProductPreview />
        </div>
      </section>

      <Section title="What Propfolio does." lead="Ten things, done properly.">
        <div className="space-y-4">
          {FEATURES.map((f, i) => {
            const Icon = FEATURE_ICONS[f.key];
            const paid = PLAN_OF[f.key];
            const plan = paid ? PLAN_CONFIG[FEATURE_PLAN[paid]].label : null;
            return (
              <Reveal key={f.key}>
                <article
                  id={f.key}
                  className="grid scroll-mt-24 gap-6 rounded-2xl border p-6 sm:p-8 md:grid-cols-[auto_1fr_1fr]"
                >
                  <span className="bg-primary-soft text-primary inline-flex size-12 items-center justify-center rounded-xl">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-muted-foreground text-sm">
                      {String(i + 1).padStart(2, "0")}
                      {plan ? ` · From ${plan}` : " · On every plan"}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">{f.title}</h2>
                    <p className="text-muted-foreground mt-2 text-lg">{f.summary}</p>
                  </div>
                  <ul className="space-y-2">
                    {f.details.map((d) => (
                      <li key={d} className="flex gap-2">
                        <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                        {d}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <Section
        className="bg-muted/40"
        eyebrow="Built for the Philippines"
        title="The way you already lease."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Pesos to the centavo", "₱12,500.00, never ₱12,499.99. Every amount is exact."],
            ["Manila time", "Dates and reminders follow Philippine time, not a server overseas."],
            [
              "Data Privacy Act",
              "Privacy notices, data exports, anonymisation and retention, built in.",
            ],
            ...SEGMENTS.map((s) => [s.title, s.text]),
          ].map(([t, d]) => (
            <div key={t} className="bg-card rounded-2xl border p-6">
              <h3 className="text-xl font-semibold">{t}</h3>
              <p className="text-muted-foreground mt-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
