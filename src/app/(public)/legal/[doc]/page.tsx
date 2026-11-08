import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LEGAL_DOCUMENTS, LEGAL_INFO, type LegalDocumentName } from "@/domain/legal/documents";
import { formatIsoDate } from "@/domain/time/manila";
import { COMPANY } from "@/domain/legal/company";
import { env } from "@/server/env";

const BY_SLUG: Record<string, LegalDocumentName> = Object.fromEntries(
  LEGAL_DOCUMENTS.map((d) => [LEGAL_INFO[d].path.split("/").pop()!, d]),
);

// Reads the support email (a server setting) when the page is shown, not when it is built.
export const dynamic = "force-dynamic";

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
    <article className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold">{info.title}</h1>
      <p className="text-muted-foreground mt-2">Version of {formatIsoDate(info.version)}</p>
      <div className="border-warning bg-warning-soft text-warning mt-8 rounded-lg border p-4 font-medium">
        [LAWYER TO SUPPLY] The full text of the {info.title} will appear here.
      </div>
      <section aria-labelledby="who" className="mt-8">
        <h2 id="who" className="text-xl font-semibold">
          Who we are
        </h2>
        <dl className="mt-3 divide-y rounded-xl border">
          {(
            [
              ["Provider", `${COMPANY.legalName} (${COMPANY.tradeName})`],
              ["Address", COMPANY.address],
              ["Contact", env().SUPPORT_EMAIL ?? "[TO SUPPLY: support email]"],
              ...(d === "PRIVACY" ? [["Where data is kept", COMPANY.dataHosting]] : []),
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="grid gap-1 p-3 sm:grid-cols-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="sm:col-span-2">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
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
    </article>
  );
}
