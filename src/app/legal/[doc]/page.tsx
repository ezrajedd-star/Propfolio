import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/app/logo";
import { LEGAL_DOCUMENTS, LEGAL_INFO, type LegalDocumentName } from "@/domain/legal/documents";
import { formatIsoDate } from "@/domain/time/manila";

const BY_SLUG: Record<string, LegalDocumentName> = Object.fromEntries(
  LEGAL_DOCUMENTS.map((d) => [LEGAL_INFO[d].path.split("/").pop()!, d]),
);

export function generateStaticParams() {
  return Object.keys(BY_SLUG).map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const d = BY_SLUG[(await params).doc];
  return { title: d ? LEGAL_INFO[d].title : "Not found" };
}

/** Public: anyone can read what they are asked to accept. The text comes from the lawyer. */
export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = BY_SLUG[(await params).doc];
  if (!d) notFound();
  const info = LEGAL_INFO[d];
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" aria-label="Propfolio home">
        <Logo />
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">{info.title}</h1>
      <p className="text-muted-foreground mt-2">Version of {formatIsoDate(info.version)}</p>
      <div className="border-warning bg-warning-soft text-warning mt-8 rounded-lg border p-4 font-medium">
        [LAWYER TO SUPPLY] The full text of the {info.title} will appear here.
      </div>
      <nav aria-label="Legal documents" className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
        {LEGAL_DOCUMENTS.filter((o) => o !== d).map((o) => (
          <Link
            key={o}
            href={LEGAL_INFO[o].path}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {LEGAL_INFO[o].title}
          </Link>
        ))}
      </nav>
    </main>
  );
}
