import { ArrowRight, Check, Quote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FeatureBento } from "@/components/marketing/bento";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { PlanCards } from "@/components/marketing/plan-cards";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Reveal } from "@/components/marketing/reveal";
import { PlaceholderBadge, Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import {
  FACTS,
  FAQ,
  HOW_IT_WORKS,
  SEGMENTS,
  STORIES,
  VALUE_PROPOSITION as V,
} from "@/domain/marketing/content";

export const metadata: Metadata = {
  title: { absolute: "Propfolio · Never miss a lease renewal again" },
  description: V.subhead,
};

/** The website's home page, shown at "/" to anyone not signed in. */
export default function HomePage() {
  return (
    <>
      {/* Hero: the promise, the action, and the product */}
      <section className="relative overflow-hidden px-4 pt-14 pb-16 sm:pt-20">
        <div
          aria-hidden
          className="from-primary-soft pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b to-transparent"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="bg-card text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold">
              {V.eyebrow}
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              {V.headline}
            </h1>
            <p className="text-muted-foreground mt-5 max-w-xl text-lg sm:text-xl">{V.subhead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  {V.primaryCta} <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact#demo">{V.secondaryCta}</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {V.proof.map((p) => (
                <li key={p} className="text-muted-foreground flex items-center gap-1.5">
                  <Check className="text-primary size-4" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Facts strip */}
      <section aria-label="Propfolio in numbers" className="border-y px-4 py-10">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <Reveal key={f.label} delay={i * 80} className="flex flex-col-reverse">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-3xl font-semibold tracking-tight sm:text-4xl">{f.value}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* The problem, in one line */}
      <Section
        eyebrow="Why Propfolio"
        title="Spreadsheets don't send reminders."
        lead="A missed renewal means a vacant unit, a lost tenant or rent left at last year's rate. Propfolio watches every lease for you and tells your team in time to act."
        center
      >
        <FeatureBento />
      </Section>

      {/* How it works */}
      <Section
        className="bg-muted/40"
        eyebrow="How it works"
        title="Up and running this afternoon."
        lead="No installation, no training course. If you can use a spreadsheet, you can use Propfolio."
      >
        <ol className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <Reveal key={s.step} delay={i * 100}>
              <li className="bg-card h-full rounded-2xl border p-6">
                <span className="bg-primary text-primary-foreground inline-flex size-10 items-center justify-center rounded-full text-lg font-semibold">
                  {s.step}
                </span>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="text-muted-foreground mt-2">{s.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* Who it's for */}
      <Section
        eyebrow="Who it's for"
        title="Made for every kind of lease."
        lead="Different properties need different warnings. Propfolio sets lead times by property type, so a warehouse gets six months' notice and an apartment gets sixty days."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {SEGMENTS.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <div className="h-full rounded-2xl border p-6">
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="text-muted-foreground mt-2">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Customer stories (placeholders until real ones are supplied) */}
      <Section
        className="bg-muted/40"
        eyebrow="Customer stories"
        title="Lessors who stopped chasing dates."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {STORIES.map((s) => (
            <figure key={s.slug} className="bg-card flex h-full flex-col rounded-2xl border p-6">
              <div className="mb-3 flex items-center justify-between">
                <Quote className="text-primary size-6" aria-hidden />
                {s.placeholder ? <PlaceholderBadge /> : null}
              </div>
              <blockquote className="flex-1 text-lg">{s.quote}</blockquote>
              <figcaption className="text-muted-foreground mt-4">
                <span className="text-foreground font-semibold">{s.company}</span>
                <br />
                {s.segment}
              </figcaption>
            </figure>
          ))}
        </div>
        <Link
          href="/customers"
          className="text-primary mt-6 inline-flex min-h-10 items-center gap-2 font-semibold underline-offset-4 hover:underline"
        >
          Read the stories <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Section>

      {/* Pricing teaser */}
      <Section
        eyebrow="Pricing"
        title="Start free. Upgrade when you grow."
        lead="Prices in Philippine pesos, billed monthly. Cancel any time."
        center
      >
        <PlanCards />
        <p className="mt-6 text-center">
          <Link
            href="/pricing"
            className="text-primary inline-flex min-h-10 items-center gap-2 font-semibold underline-offset-4 hover:underline"
          >
            Compare plans in detail <ArrowRight className="size-4" aria-hidden />
          </Link>
        </p>
      </Section>

      {/* FAQ */}
      <Section eyebrow="Questions" title="Good questions, plain answers." className="pt-0">
        <div className="max-w-3xl">
          <FaqList items={FAQ.filter((_, i) => [0, 1, 3, 4, 7].includes(i))} />
          <Link
            href="/help"
            className="text-primary mt-6 inline-flex min-h-10 items-center gap-2 font-semibold underline-offset-4 hover:underline"
          >
            More answers in the Help centre <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
