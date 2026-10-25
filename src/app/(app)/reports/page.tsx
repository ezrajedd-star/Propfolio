import {
  BarChart3,
  CalendarClock,
  Coins,
  Hourglass,
  Building2,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { REPORT_IDS, REPORTS, type ReportId } from "@/domain/reports/definitions";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Reports" };

const ICONS: Record<ReportId, typeof BarChart3> = {
  expiry: CalendarClock,
  occupancy: Building2,
  "rent-roll": BarChart3,
  collections: Coins,
  aging: Hourglass,
  renewals: RefreshCw,
};

export default async function ReportsPage() {
  await requirePageUser("report.view");
  return (
    <>
      <PageHeader
        title="Reports"
        description="Choose a report. Each one can be filtered by building, unit type and dates, and downloaded for Excel."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_IDS.map((id) => {
          const r = REPORTS[id];
          const Icon = ICONS[id];
          return (
            <li key={id}>
              <Link
                href={`/reports/${id}`}
                className="bg-card hover:bg-muted/50 flex h-full items-start gap-4 rounded-xl border p-5 shadow-sm transition-colors"
              >
                <span className="bg-primary-soft text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{r.title}</span>
                  <span className="text-muted-foreground block">{r.description}</span>
                </span>
                <ChevronRight className="text-muted-foreground mt-1 size-5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
