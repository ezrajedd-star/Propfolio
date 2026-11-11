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
import { formatDateTime } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { requirePlatformPage } from "@/server/platform/current";
import { listWebsiteLeads } from "@/server/website-leads/service";
import { RESOURCES, type ResourceSlug } from "@/schemas/website-lead";
import { HandledButton } from "../demo-requests/handled-button";

export const metadata: Metadata = { title: "Partners and downloads" };

/** Partner applications and free-template requests from the website. */
export default async function WebsiteLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; all?: string }>;
}) {
  const admin = await requirePlatformPage();
  const sp = await searchParams;
  const kind = sp.kind === "RESOURCE" ? "RESOURCE" : "PARTNER";
  const all = sp.all === "1";
  const rows = await listWebsiteLeads(admin, { kind, includeHandled: all });
  const href = (k: string, a: boolean) => `/platform/website-leads?kind=${k}${a ? "&all=1" : ""}`;
  return (
    <>
      <PageHeader
        title="Partners and downloads"
        description="Partner applications and people who downloaded the free lease tracker. Removed after a year."
      />
      <nav aria-label="Kind" className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["PARTNER", "Partner applications"],
            ["RESOURCE", "Template downloads"],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={href(k, all)}
            aria-current={kind === k ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 font-medium",
              kind === k && "bg-primary text-primary-foreground border-primary",
            )}
          >
            {label}
          </Link>
        ))}
        <Link
          href={href(kind, !all)}
          className="text-primary inline-flex min-h-10 items-center px-2 underline underline-offset-4"
        >
          {all ? "Show only open ones" : "Show handled ones too"}
        </Link>
      </nav>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-6">Nothing here yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>{kind === "PARTNER" ? "Works as" : "Resource"}</TableHead>
                <TableHead>{kind === "PARTNER" ? "Message" : "News by email"}</TableHead>
                <TableHead>
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell>
                    <span className="font-medium">{r.name}</span>
                    <br />
                    <a
                      href={`mailto:${r.email}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {r.email}
                    </a>
                    {r.phone ? (
                      <>
                        <br />
                        {r.phone}
                      </>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.company || "—"}</TableCell>
                  <TableCell>
                    {kind === "PARTNER"
                      ? r.partnerType
                      : (RESOURCES[r.resource as ResourceSlug] ?? r.resource)}
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-pre-wrap">
                    {kind === "PARTNER" ? r.message || "—" : r.wantsUpdates ? "Yes" : "No"}
                  </TableCell>
                  <TableCell>
                    <HandledButton id={r.id} handled={r.handledAt !== null} kind="lead" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
