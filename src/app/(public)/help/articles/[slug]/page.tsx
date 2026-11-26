import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/marketing/article-body";
import { Section } from "@/components/marketing/section";
import { excerpt } from "@/domain/help/articles";
import { formatDate } from "@/domain/time/manila";
import { getPublishedArticle } from "@/server/help/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = await getPublishedArticle((await params).slug);
  return a ? { title: a.title, description: excerpt(a.body, 150) } : { title: "Not found" };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getPublishedArticle((await params).slug);
  if (!a) notFound();
  return (
    <Section>
      <article className="mx-auto max-w-2xl">
        <Link
          href="/help/articles"
          className="text-primary inline-flex min-h-10 items-center underline"
        >
          ← All help articles
        </Link>
        <p className="text-muted-foreground mt-4">{a.category}</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{a.title}</h1>
        <p className="text-muted-foreground mt-2">Updated {formatDate(a.updatedAt)}</p>
        <div className="mt-8">
          <ArticleBody body={a.body} />
        </div>
        <p className="bg-muted/50 mt-10 rounded-xl p-5 text-lg">
          Still stuck? In Propfolio, use the <strong>Help</strong> button to ask us, or{" "}
          <Link href="/contact" className="text-primary underline">
            contact us
          </Link>
          .
        </p>
      </article>
    </Section>
  );
}
