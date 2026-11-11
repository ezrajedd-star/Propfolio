import { Quote } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { PlaceholderBadge, Section } from "@/components/marketing/section";
import { STORIES } from "@/domain/marketing/content";

export const metadata: Metadata = {
  title: "Customer stories",
  description: "How Philippine lessors use Propfolio to stay ahead of every lease.",
};

export default function CustomersPage() {
  const anyPlaceholder = STORIES.some((s) => s.placeholder);
  return (
    <>
      <section className="px-4 pt-14 pb-4 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Customers</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Lessors who stopped chasing dates
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Residential, commercial and industrial lessors across the Philippines use Propfolio to
          stay ahead of every renewal.
        </p>
        {anyPlaceholder ? (
          <p className="border-warning bg-warning-soft text-warning mx-auto mt-6 max-w-2xl rounded-lg border p-3 font-medium">
            These stories are placeholders. Real customer stories will replace them once customers
            agree to be featured.
          </p>
        ) : null}
      </section>

      <Section>
        <div className="space-y-6">
          {STORIES.map((s) => (
            <article
              key={s.slug}
              id={s.slug}
              className="grid gap-8 rounded-3xl border p-6 sm:p-10 lg:grid-cols-[1.5fr_1fr]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold">{s.company}</h2>
                  {s.placeholder ? <PlaceholderBadge /> : null}
                </div>
                <p className="text-muted-foreground mt-1">{s.segment}</p>
                <figure className="mt-6">
                  <Quote className="text-primary size-8" aria-hidden />
                  <blockquote className="mt-3 text-xl leading-relaxed sm:text-2xl">
                    {s.quote}
                  </blockquote>
                  <figcaption className="text-muted-foreground mt-4">
                    {s.person}, {s.role}
                  </figcaption>
                </figure>
              </div>
              <dl className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {s.results.map((r) => (
                  <div
                    key={r.label}
                    className="bg-primary-soft flex flex-col-reverse rounded-2xl p-5"
                  >
                    <dt className="text-muted-foreground">{r.label}</dt>
                    <dd className="text-primary text-3xl font-semibold">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Be one of our first stories."
        text="Early customers help shape Propfolio. Start free, or book a demo and tell us how you lease."
      />
    </>
  );
}
