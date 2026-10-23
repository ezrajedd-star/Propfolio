import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { auditActionLabel, failureReasonLabel } from "@/domain/audit/labels";
import { ROLE_LABELS } from "@/domain/auth/roles";
import { formatDateTime } from "@/domain/time/manila";
import {
  auditLogQuerySchema,
  listAuditActions,
  listAuditLog,
  type AuditLogRow,
} from "@/server/audit-log/service";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Audit log" };

type Search = { q?: string; action?: string; from?: string; to?: string; page?: string };

function Details({ row }: { row: AuditLogRow }) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const reason = failureReasonLabel(metadata.reason);
  const hasChanges =
    row.changes && typeof row.changes === "object" && Object.keys(row.changes).length > 0;
  return (
    <div className="space-y-1">
      {reason ? <p className="text-sm">Reason: {reason}</p> : null}
      {hasChanges || Object.keys(metadata).length > 0 ? (
        <details className="text-sm">
          <summary className="text-primary cursor-pointer">Show details</summary>
          <pre className="bg-muted mt-2 max-w-md overflow-x-auto rounded p-3 text-xs whitespace-pre-wrap">
            {JSON.stringify(
              {
                ...(hasChanges ? { changes: row.changes } : {}),
                ...(Object.keys(metadata).length ? { details: metadata } : {}),
              },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePageUser("audit.view");
  const raw = await searchParams;
  // Drop invalid filters instead of failing the page.
  const parsed = auditLogQuerySchema.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v)),
  );
  const filters = parsed.success ? parsed.data : { page: 1 };
  const [log, actions] = await Promise.all([listAuditLog(actor, filters), listAuditActions(actor)]);

  const pageHref = (page: number) => {
    const params = new URLSearchParams(
      Object.entries({ ...raw, page: String(page) }).filter(([, v]) => v) as [string, string][],
    );
    return `?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A permanent record of sign-ins, changes and other important actions. Entries can't be edited or deleted."
      />

      <form
        className="bg-card mb-6 grid gap-4 rounded-xl border p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto] lg:items-end"
        role="search"
      >
        <div className="space-y-2">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={raw.q} placeholder="Name, record or IP address" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="action">What happened</Label>
          <NativeSelect id="action" name="action" defaultValue={raw.action ?? ""}>
            <option value="">Everything</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {auditActionLabel(a)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={raw.from} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={raw.to} />
        </div>
        <div className="flex gap-2">
          <Button type="submit">
            <Search aria-hidden /> Search
          </Button>
          {Object.values(raw).some(Boolean) ? (
            <Button asChild variant="ghost">
              <Link href="/settings/audit-log">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {log.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No entries match">
          Try a wider date range or clear the filters.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What happened</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>IP address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.rows.map((row) => (
                <TableRow key={row.seq} className="align-top">
                  <TableCell className="whitespace-nowrap">{formatDateTime(row.at)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.actorName ?? "System"}</div>
                    {row.actorRole ? (
                      <div className="text-muted-foreground text-sm">
                        {ROLE_LABELS[row.actorRole]}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{auditActionLabel(row.action)}</TableCell>
                  <TableCell>
                    <div>{row.entityType}</div>
                    {row.entityId ? (
                      <div className="text-muted-foreground font-mono text-xs">{row.entityId}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Details row={row} />
                  </TableCell>
                  <TableCell className="font-mono text-sm whitespace-nowrap">
                    {row.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-4">
        <p className="text-muted-foreground">
          {log.total.toLocaleString("en-PH")} entr{log.total === 1 ? "y" : "ies"} · page {log.page}{" "}
          of {log.pageCount}
        </p>
        <div className="flex gap-2">
          {log.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={pageHref(log.page - 1)}>
                <ChevronLeft aria-hidden /> Newer
              </Link>
            </Button>
          ) : null}
          {log.page < log.pageCount ? (
            <Button asChild variant="outline">
              <Link href={pageHref(log.page + 1)}>
                Older <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </>
  );
}
