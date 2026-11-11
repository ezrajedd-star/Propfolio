import { Check, FileSpreadsheet, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { Section } from "@/components/marketing/section";
import { EXCEL_COMPARISON } from "@/domain/marketing/pages";

export const metadata: Metadata = {
  title: "Propfolio vs Excel",
  description:
    "Why Philippine lessors move their leases from a spreadsheet to Propfolio, and how to bring the spreadsheet with you.",
};

export default function CompareExcelPage() {
  return (
    <>
      <section className="px-4 pt-14 pb-6 text-center sm:pt-20">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">
          Propfolio vs Excel
        </p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your spreadsheet got you this far. It can&apos;t remind you.
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          Excel is great for numbers. Leases need more: dates that warn you, rent that calculates
          itself, and a record of who changed what.
        </p>
      </section>

      <Section className="pt-6">
        {/* Phones: one card per topic. Wider screens: a table. */}
        <ul className="space-y-4 md:hidden">
          {EXCEL_COMPARISON.map((r) => (
            <li key={r.topic} className="rounded-2xl border p-5">
              <h2 className="text-lg font-semibold">{r.topic}</h2>
              <p className="text-muted-foreground mt-3 flex gap-2">
                <X className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  <span className="sr-only">Excel: </span>
                  {r.excel}
                </span>
              </p>
              <p className="mt-2 flex gap-2">
                <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  <span className="sr-only">Propfolio: </span>
                  {r.propfolio}
                </span>
              </p>
            </li>
          ))}
        </ul>
        <div className="relative hidden overflow-hidden rounded-2xl border md:block">
          <table className="w-full text-left">
            <caption className="sr-only">Propfolio and Excel compared</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="w-1/5 p-4">
                  <span className="sr-only">Topic</span>
                </th>
                <th scope="col" className="p-4 font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <FileSpreadsheet className="size-5 text-green-700" aria-hidden /> A spreadsheet
                  </span>
                </th>
                <th scope="col" className="bg-primary-soft text-primary p-4 font-semibold">
                  Propfolio
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {EXCEL_COMPARISON.map((r) => (
                <tr key={r.topic}>
                  <th scope="row" className="p-4 font-semibold">
                    {r.topic}
                  </th>
                  <td className="text-muted-foreground p-4">
                    <span className="flex gap-2">
                      <X className="mt-0.5 size-5 shrink-0" aria-hidden />
                      {r.excel}
                    </span>
                  </td>
                  <td className="bg-primary-soft/40 p-4">
                    <span className="flex gap-2">
                      <Check className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                      {r.propfolio}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        className="bg-muted/40"
        eyebrow="Moving over"
        title="Bring your spreadsheet with you."
        lead="You don't have to start again. Copy your rows into our import template, upload it, and fix anything Propfolio points out. Nothing is saved until the whole file is right."
      >
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            ["Sign up free", "Two minutes, no card."],
            [
              "Download the template",
              "From Settings → Import, one sheet each for buildings, units, tenants and leases.",
            ],
            ["Upload and check", "Every problem listed row by row, then import in one go."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-card rounded-2xl border p-6">
              <span className="bg-primary text-primary-foreground inline-flex size-10 items-center justify-center rounded-full text-lg font-semibold">
                {i + 1}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{t}</h3>
              <p className="text-muted-foreground mt-2">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6">
          Not ready to switch?{" "}
          <Link
            href="/resources#lease-tracker"
            className="text-primary underline underline-offset-4"
          >
            Get our free Excel lease tracker
          </Link>{" "}
          in the meantime.
        </p>
      </Section>

      <CtaBand title="Leave the spreadsheet behind." />
    </>
  );
}
