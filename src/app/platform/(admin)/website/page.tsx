import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { requirePlatformPage } from "@/server/platform/current";
import { websiteReport } from "@/server/website-stats/service";

export const metadata: Metadata = { title: "Website" };

const RANGES = [7, 30, 90] as const;

const rate = (signups: number, visits: number) =>
  visits === 0 ? "—" : `${((signups / visits) * 100).toFixed(1)}%`;

/** Website visits and sign-ups, counts only. */
export default async function WebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requirePlatformPage("console.view", { action: "console.website_viewed" });
  const asked = Number((await searchParams).days);
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 30;
  const r = await websiteReport(admin, days);
  const peak = Math.max(1, ...r.daily.map((d) => d.visits));

  return (
    <>
      <PageHeader
        title="Website"
        description={`Visits and new accounts, ${formatIsoDate(r.from)} to ${formatIsoDate(r.to)}. Counts only: nothing about who visited is kept. Search engines and bots aren't counted.`}
      />
      <nav aria-label="Period" className="mb-6 flex flex-wrap gap-2">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/platform/website?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 font-medium",
              d === days && "bg-primary text-primary-foreground border-primary",
            )}
          >
            Last {d} days
          </Link>
        ))}
      </nav>

      <dl className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Page visits", r.visits.toLocaleString("en-PH")],
          ["New accounts", r.signups.toLocaleString("en-PH")],
          ["Visits that became accounts", rate(r.signups, r.visits)],
        ].map(([label, value]) => (
          <Card key={label} className="flex flex-col-reverse p-5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-3xl font-semibold">{value}</dd>
          </Card>
        ))}
      </dl>

      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-lg font-semibold">Visits each day</h2>
        <ol className="flex h-32 items-end gap-0.5" aria-label="Visits each day">
          {r.daily.map((d) => (
            <li
              key={d.day}
              className="bg-primary/70 min-h-px flex-1 rounded-t"
              style={{ height: `${(d.visits / peak) * 100}%` }}
              title={`${formatIsoDate(d.day)}: ${d.visits} visits, ${d.signups} new accounts`}
            >
              <span className="sr-only">
                {formatIsoDate(d.day)}: {d.visits} visits, {d.signups} new accounts
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <StatTable
          title="Pages"
          first="Page (for new accounts: where they first landed)"
          rows={r.pages.map((p) => ({ key: p.path, ...p }))}
        />
        <StatTable
          title="Where visitors came from"
          first="Source"
          rows={r.sources.map((s) => ({ key: s.source, ...s }))}
        />
      </div>
    </>
  );
}

function StatTable({
  title,
  first,
  rows,
}: {
  title: string;
  first: string;
  rows: { key: string; visits: number; signups: number }[];
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <h2 className="px-5 pt-5 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground p-5">No visits counted yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{first}</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">New accounts</TableHead>
              <TableHead className="text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium break-all">{r.key}</TableCell>
                <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                <TableCell className="text-right tabular-nums">{r.signups}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {rate(r.signups, r.visits)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
