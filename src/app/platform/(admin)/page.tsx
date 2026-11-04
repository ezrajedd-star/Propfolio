import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatIsoDate } from "@/domain/time/manila";
import { listAccounts } from "@/server/platform/accounts";
import { requirePlatformPage } from "@/server/platform/current";
import { AccountStatusBadge, planLabel } from "./account-badges";

export const metadata: Metadata = { title: "Accounts" };

export default async function PlatformAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const admin = await requirePlatformPage();
  const { q } = await searchParams;
  const accounts = await listAccounts(admin, { q: q?.slice(0, 100) });

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every customer account, newest first. Open one to extend its trial, record a bank transfer, or suspend it."
      />
      <form className="mb-6 flex max-w-md gap-3" role="search">
        <label htmlFor="q" className="sr-only">
          Search accounts by name
        </label>
        <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Search by name" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid until</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  {q ? "No account matches that name." : "No accounts yet."}
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`/platform/accounts/${a.id}`}
                      className="text-primary font-medium underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>{planLabel(a)}</TableCell>
                  <TableCell>
                    <AccountStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>{a.paidUntil ? formatIsoDate(a.paidUntil) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.activeUsers}
                    {a.activeUsers > a.userLimit ? (
                      <span className="text-danger block text-sm">over limit of {a.userLimit}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.units}</TableCell>
                  <TableCell>{formatDate(a.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
