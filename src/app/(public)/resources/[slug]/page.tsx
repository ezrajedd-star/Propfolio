import { ArrowLeft, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaBand } from "@/components/marketing/cta-band";
import { GUIDES } from "@/domain/marketing/pages";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  return g ? { title: g.title, description: g.summary } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) notFound();
  const others = GUIDES.filter((x) => x.slug !== g.slug);
  return (
    <>
      <article className="mx-auto max-w-2xl px-4 pt-12 pb-16">
        <Link
          href="/resources"
          className="text-primary inline-flex min-h-10 items-center gap-2 font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> All guides and templates
        </Link>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">{g.title}</h1>
        <p className="text-muted-foreground mt-3 text-xl">{g.summary}</p>
        <p className="text-muted-foreground mt-3 flex items-center gap-1">
          <Clock className="size-4" aria-hidden /> {g.minutes} min read
        </p>
        <div className="mt-10 space-y-10">
          {g.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-2xl font-semibold">{s.heading}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="mt-3 text-lg leading-relaxed">
                  {p}
                </p>
              ))}
              {s.list ? (
                <ul className="mt-3 list-disc space-y-2 pl-6 text-lg">
                  {s.list.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <aside className="bg-muted/60 mt-12 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">More guides</h2>
          <ul className="mt-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/resources/${o.slug}`}
                  className="text-primary inline-flex min-h-10 items-center underline underline-offset-4"
                >
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </article>
      <CtaBand />
    </>
  );
}
