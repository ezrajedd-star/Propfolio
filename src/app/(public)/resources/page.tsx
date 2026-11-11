import { ArrowRight, BookOpen, Clock, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { Section } from "@/components/marketing/section";
import { GUIDES } from "@/domain/marketing/pages";
import { ResourceForm } from "./resource-form";

export const metadata: Metadata = {
  title: "Guides and templates",
  description:
    "A free Excel lease tracker and plain guides on renewals, rent escalation and the Data Privacy Act for Philippine lessors.",
};

export default function ResourcesPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-6 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Resources</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Guides and templates for Philippine lessors
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Free, practical and in plain words, whether or not you use Propfolio.
        </p>
      </section>

      <Section id="lease-tracker" className="scroll-mt-20 pt-6">
        <div className="grid gap-8 rounded-3xl border p-6 sm:p-10 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-green-50 text-green-700">
              <FileSpreadsheet className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-3xl font-semibold">Free Excel lease tracker</h2>
            <p className="text-muted-foreground mt-3 text-lg">
              One row per lease. Days left and &quot;what to do&quot; fill in by themselves, with
              the leases that need a call highlighted.
            </p>
            <ul className="mt-4 space-y-1">
              <li>• Works in Excel, Google Sheets and Numbers</li>
              <li>• Room for 200 leases</li>
              <li>• Sample rows to show how it works</li>
            </ul>
          </div>
          <ResourceForm />
        </div>
      </Section>

      <Section className="bg-muted/40" eyebrow="Guides" title="Read in five minutes or less.">
        <ul className="grid gap-4 md:grid-cols-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/resources/${g.slug}`}
                className="bg-card group hover:border-primary/40 flex h-full flex-col rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0"
              >
                <BookOpen className="text-primary size-6" aria-hidden />
                <h3 className="mt-4 text-xl font-semibold">{g.title}</h3>
                <p className="text-muted-foreground mt-2 flex-1">{g.summary}</p>
                <span className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <Clock className="size-4" aria-hidden /> {g.minutes} min read
                  </span>
                  <span className="text-primary flex items-center gap-1 font-semibold">
                    Read <ArrowRight className="size-4" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}
