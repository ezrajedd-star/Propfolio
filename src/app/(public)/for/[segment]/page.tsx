import { ArrowRight, Bell, Check, Quote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand } from "@/components/marketing/cta-band";
import { FEATURE_ICONS } from "@/components/marketing/feature-icons";
import { Reveal } from "@/components/marketing/reveal";
import { PlaceholderBadge, Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { FEATURES, STORIES } from "@/domain/marketing/content";
import { SEGMENT_PAGES } from "@/domain/marketing/pages";
import { UNIT_TYPE_REMINDER_DEFAULTS } from "@/domain/reminders/config";

export function generateStaticParams() {
  return SEGMENT_PAGES.map((s) => ({ segment: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>;
}): Promise<Metadata> {
  const { segment } = await params;
  const s = SEGMENT_PAGES.find((p) => p.slug === segment);
  return s ? { title: `For ${s.audience} lessors`, description: s.lead } : {};
}

/** "120, 90 and 60 days" */
function daysList(days: number[]): string {
  const d = [...days].sort((a, b) => b - a);
  return d.length === 1 ? `${d[0]} days` : `${d.slice(0, -1).join(", ")} and ${d.at(-1)} days`;
}

/** One page per kind of property: the same product, told in that lessor's words. */
export default async function SegmentPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  const s = SEGMENT_PAGES.find((p) => p.slug === segment);
  if (!s) notFound();
  const lead = UNIT_TYPE_REMINDER_DEFAULTS[s.unitType]!.leadDays;
  const story = STORIES.find((x) => x.slug === s.storySlug);
  const features = s.features.map((k) => FEATURES.find((f) => f.key === k)!);

  return (
    <>
      <section className="from-primary-soft bg-gradient-to-b to-transparent px-4 pt-14 pb-10 sm:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              For {s.audience} lessors
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {s.headline}
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">{s.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start free <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact#demo">Book a demo</Link>
              </Button>
            </div>
          </div>
          <div className="bg-card rounded-2xl border p-6 shadow-lg">
            <p className="text-muted-foreground text-sm">
              Standard reminders for {s.unitType.toLowerCase()} units
            </p>
            <ul className="mt-4 space-y-3">
              {[...lead]
                .sort((a, b) => b - a)
                .map((d) => (
                  <li key={d} className="bg-muted/60 flex items-center gap-3 rounded-lg p-3">
                    <Bell className="text-primary size-5" aria-hidden />
                    <span className="font-medium">{d} days before the lease ends</span>
                  </li>
                ))}
            </ul>
            <p className="text-muted-foreground mt-4 text-sm">
              Change them for any property type or unit on Pro and Premium.
            </p>
          </div>
        </div>
      </section>

      <Section eyebrow="The everyday problems" title="What gets easier.">
        <div className="grid gap-4 md:grid-cols-3">
          {s.pains.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <div className="h-full rounded-2xl border p-6">
                <h3 className="text-xl font-semibold">{p.title}</h3>
                <p className="text-muted-foreground mt-2">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        className="bg-muted/40"
        eyebrow="The tools you'll use most"
        title={`Built for ${s.audience} leases.`}
        lead={`Reminders go out ${daysList(lead)} before each ${s.unitType.toLowerCase()} lease ends, unless you choose otherwise.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => {
            const Icon = FEATURE_ICONS[f.key];
            return (
              <div key={f.key} className="bg-card rounded-2xl border p-6">
                <span className="bg-primary-soft text-primary inline-flex size-11 items-center justify-center rounded-xl">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-xl font-semibold">{f.title}</h3>
                <ul className="mt-3 space-y-2">
                  {f.details.map((d) => (
                    <li key={d} className="flex gap-2">
                      <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>

      {story ? (
        <Section>
          <figure className="mx-auto max-w-3xl rounded-3xl border p-8 text-center">
            <div className="flex items-center justify-center gap-3">
              <Quote className="text-primary size-8" aria-hidden />
              {story.placeholder ? <PlaceholderBadge /> : null}
            </div>
            <blockquote className="mt-4 text-xl sm:text-2xl">{story.quote}</blockquote>
            <figcaption className="text-muted-foreground mt-4">
              {story.company} · {story.segment}
            </figcaption>
          </figure>
        </Section>
      ) : null}

      <Section className="pt-0">
        <nav aria-label="Other kinds of property" className="flex flex-wrap justify-center gap-3">
          {SEGMENT_PAGES.filter((o) => o.slug !== s.slug).map((o) => (
            <Link
              key={o.slug}
              href={`/for/${o.slug}`}
              className="hover:border-primary hover:text-primary inline-flex min-h-10 items-center gap-2 rounded-full border px-4 font-medium"
            >
              For {o.label.toLowerCase()} <ArrowRight className="size-4" aria-hidden />
            </Link>
          ))}
        </nav>
      </Section>

      <CtaBand />
    </>
  );
}
