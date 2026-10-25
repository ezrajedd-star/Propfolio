import { Download, FileBarChart } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/app/back-link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/roles";
import {
  EXPIRY_WINDOWS,
  isReportId,
  REPORTS,
  type ReportColumn,
  type ReportValue,
} from "@/domain/reports/definitions";
import { formatPeso } from "@/domain/money/money";
import { formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/current";
import { listBuildings } from "@/server/property/buildings";
import { listUnitTypes } from "@/server/property/unit-types";
import { parseReportFilters, runReport } from "@/server/reports/service";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: isReportId(id) ? REPORTS[id].title : "Report" };
}

function show(c: ReportColumn, v: ReportValue | undefined): string {
  if (v === null || v === undefined || v === "") return c.kind === "text" ? "—" : "";
  if (c.kind === "money") return formatPeso(String(v));
  if (c.kind === "date") return formatIsoDate(String(v));
  if (c.kind === "percent") return `${v}%`;
  return String(v);
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageUser("report.view");
  const { id } = await params;
  if (!isReportId(id)) notFound();
  const sp = new URLSearchParams(
    Object.entries(await searchParams).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
  const filters = parseReportFilters(sp);
  const [report, buildings, unitTypes] = await Promise.all([
    runReport(actor, id, filters),
    listBuildings(actor),
    listUnitTypes(actor),
  ]);
  const info = REPORTS[id];
  const query = new URLSearchParams({
    ...(filters.buildingId ? { building: filters.buildingId } : {}),
    ...(filters.unitTypeId ? { unitType: filters.unitTypeId } : {}),
    ...(info.uses.dateRange ? { from: filters.from, to: filters.to } : {}),
    ...(info.uses.window ? { days: String(filters.days) } : {}),
  });
  const right = (c: ReportColumn) => c.kind !== "text" && c.kind !== "date";

  return (
    <>
      <BackLink href="/reports">Reports</BackLink>
      <PageHeader
        title={info.title}
        description={report.subtitle}
        actions={
          can(actor.role, "data.export") ? (
            <>
              <Button variant="outline" asChild>
                <a href={`/api/v1/reports/${id}/export?${query}&format=csv`}>
                  <Download aria-hidden /> CSV
                </a>
              </Button>
              <Button asChild data-guide="report-download">
                <a href={`/api/v1/reports/${id}/export?${query}&format=xlsx`}>
                  <Download aria-hidden /> Download for Excel
                </a>
              </Button>
            </>
          ) : null
        }
      />

      <form
        data-guide="report-filters"
        method="get"
        className="bg-card mb-6 flex flex-wrap items-end gap-4 rounded-xl border p-4"
      >
        <div className="w-full space-y-1.5 sm:w-56">
          <Label htmlFor="building">Building</Label>
          <NativeSelect id="building" name="building" defaultValue={filters.buildingId ?? ""}>
            <option value="">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-full space-y-1.5 sm:w-56">
          <Label htmlFor="unitType">Unit type</Label>
          <NativeSelect id="unitType" name="unitType" defaultValue={filters.unitTypeId ?? ""}>
            <option value="">All unit types</option>
            {unitTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {info.uses.window ? (
          <div className="w-full space-y-1.5 sm:w-56">
            <Label htmlFor="days">Ending within</Label>
            <NativeSelect id="days" name="days" defaultValue={String(filters.days)}>
              {EXPIRY_WINDOWS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {info.uses.dateRange ? (
          <>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={filters.to} />
            </div>
          </>
        ) : null}
        <Button type="submit" variant="outline">
          Show report
        </Button>
      </form>

      {report.highlights.length ? (
        <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {report.highlights.map((h) => (
            <div key={h.label} className="bg-card rounded-xl border p-4">
              <dt className="text-muted-foreground">{h.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{h.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {report.rows.length ? (
        <Card>
          <CardContent className="overflow-x-auto pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  {report.columns.map((c) => (
                    <TableHead key={c.key} className={cn(right(c) && "text-right")}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row, i) => (
                  <TableRow key={i}>
                    {report.columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          right(c) && "text-right tabular-nums",
                          c.kind === "date" && "whitespace-nowrap",
                        )}
                      >
                        {show(c, row[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {report.totals ? (
                  <TableRow className="bg-muted/50 font-semibold">
                    {report.columns.map((c) => (
                      <TableCell key={c.key} className={cn(right(c) && "text-right tabular-nums")}>
                        {report.totals![c.key] === undefined ? "" : show(c, report.totals![c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={FileBarChart} title="Nothing to show">
          No records match these filters. Try another building, unit type or date range.
        </EmptyState>
      )}
    </>
  );
}
