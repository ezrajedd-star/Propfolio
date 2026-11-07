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
import { getSignUpFunnel, listAccounts } from "@/server/platform/accounts";
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
  const [accounts, funnel] = await Promise.all([
    listAccounts(admin, { q: q?.slice(0, 100) }),
    getSignUpFunnel(admin),
  ]);
  const pct = (n: number) =>
    funnel.started > 0 ? `${Math.round((n / funnel.started) * 100)}% of sign-ups` : "—";
  const steps = [
    { label: "Started sign-up", value: funnel.started, note: "Filled in the form" },
    { label: "Verified their email", value: funnel.verified, note: pct(funnel.verified) },
    { label: "Added a unit", value: funnel.firstUnit, note: pct(funnel.firstUnit) },
    { label: "Added a lease", value: funnel.firstLease, note: pct(funnel.firstLease) },
  ];

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every customer account, newest first. Open one to extend its trial, record a bank transfer, or suspend it."
      />
      <section aria-labelledby="funnel" className="mb-8">
        <h2 id="funnel" className="mb-3 text-xl font-semibold">
          Sign-ups, last {funnel.days} days
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className="bg-card rounded-xl border p-4">
              <span className="text-muted-foreground block text-sm">Step {i + 1}</span>
              <span className="block font-medium">{s.label}</span>
              <span className="mt-1 block text-3xl font-semibold tabular-nums">{s.value}</span>
              <span className="text-muted-foreground block text-sm">{s.note}</span>
            </li>
          ))}
        </ol>
      </section>
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
