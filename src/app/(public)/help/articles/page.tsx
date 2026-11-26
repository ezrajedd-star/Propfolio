import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TICKET_LANGUAGE_LABELS } from "@/domain/tickets/tickets";
import { listPublishedArticles } from "@/server/help/service";

export const metadata: Metadata = {
  title: "Help articles",
  description: "Step-by-step guides for using Propfolio.",
};

export const dynamic = "force-dynamic";

export default async function HelpArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q?.slice(0, 100) ?? "";
  const articles = await listPublishedArticles({ q });
  const categories = [...new Set(articles.map((a) => a.category))];
  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight">Help articles</h1>
        <form role="search" className="mt-6 flex gap-3" action="/help/articles">
          <label htmlFor="q" className="sr-only">
            Search the help articles
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="e.g. renew a lease" />
          <Button type="submit">Search</Button>
        </form>
        {articles.length === 0 ? (
          <p className="text-muted-foreground mt-8 text-lg">
            {q ? "No article matches that. Try other words, or " : "No articles yet. "}
            <Link href="/help" className="text-primary underline">
              see the common questions
            </Link>
            .
          </p>
        ) : (
          categories.map((c) => (
            <section key={c} aria-labelledby={`cat-${c}`} className="mt-10">
              <h2 id={`cat-${c}`} className="text-2xl font-semibold">
                {c}
              </h2>
              <ul className="mt-3 divide-y rounded-xl border">
                {articles
                  .filter((a) => a.category === c)
                  .map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={`/help/articles/${a.slug}`}
                        className="hover:bg-muted/50 block p-4"
                      >
                        <span className="text-primary block text-lg font-medium">{a.title}</span>
                        <span className="text-muted-foreground block">{a.excerpt}</span>
                        {a.language !== "EN" ? (
                          <span className="text-sm">{TICKET_LANGUAGE_LABELS[a.language]}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Section>
  );
}
