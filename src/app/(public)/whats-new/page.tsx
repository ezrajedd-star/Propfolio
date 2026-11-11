import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { Section } from "@/components/marketing/section";
import { CHANGELOG } from "@/domain/marketing/pages";
import { formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "What's new",
  description: "New features and improvements in Propfolio.",
};

export default function WhatsNewPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-2 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">
          What&apos;s new
        </p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          What&apos;s new in Propfolio
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          New features and improvements, newest first.
        </p>
      </section>
      <Section>
        <ol className="mx-auto max-w-3xl border-l-2 pl-6 sm:pl-8">
          {CHANGELOG.map((e) => (
            <li key={e.date + e.title} className="relative pb-12 last:pb-0">
              <span
                aria-hidden
                className="bg-primary absolute top-2 -left-[33px] size-4 rounded-full ring-4 ring-white sm:-left-[41px]"
              />
              <p className="text-muted-foreground flex flex-wrap items-center gap-3">
                <time dateTime={e.date}>{formatIsoDate(e.date)}</time>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    e.tag === "New"
                      ? "bg-primary-soft text-primary border-primary/20"
                      : "bg-muted text-foreground",
                  )}
                >
                  {e.tag}
                </span>
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{e.title}</h2>
              <ul className="mt-3 list-disc space-y-1 pl-6 text-lg">
                {e.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Section>
      <CtaBand />
    </>
  );
}
