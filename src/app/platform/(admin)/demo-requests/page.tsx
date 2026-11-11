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
import { listDemoRequests } from "@/server/demo/service";
import { requirePlatformPage } from "@/server/platform/current";
import { HandledButton } from "./handled-button";

export const metadata: Metadata = { title: "Demo requests" };

/** "Book a demo" requests from the website, newest first. */
export default async function DemoRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const admin = await requirePlatformPage();
  const all = (await searchParams).all === "1";
  const rows = await listDemoRequests(admin, { includeHandled: all });
  return (
    <>
      <PageHeader
        title="Demo requests"
        description="People who asked for a demo on the website. Reply by email, then mark them as handled. Removed after a year."
      />
      <p className="mb-4">
        <Link
          href={all ? "/platform/demo-requests" : "/platform/demo-requests?all=1"}
          className="text-primary underline underline-offset-4"
        >
          {all ? "Show only open requests" : "Show handled requests too"}
        </Link>
      </p>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-6">
            {all ? "No demo requests yet." : "No open demo requests."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Message</TableHead>
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
                  <TableCell>{r.company}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.units}</TableCell>
                  <TableCell className="max-w-sm whitespace-pre-wrap">{r.message || "—"}</TableCell>
                  <TableCell>
                    <HandledButton id={r.id} handled={r.handledAt !== null} />
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
