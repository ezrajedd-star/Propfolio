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
import { NativeSelect } from "@/components/ui/native-select";
import { TRIAL_FILTERS, type TrialFilter } from "@/server/platform/accounts";
import { AccountStatusBadge, PLAN_LABELS, planLabel } from "../account-badges";

export const metadata: Metadata = { title: "Accounts" };

const PLAN_VALUES = ["FREE", "PRO", "PREMIUM"] as const;
const STATUS_VALUES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
const STATUS_LABELS = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed by Owner" };
const TRIAL_LABELS: Record<TrialFilter, string> = {
  "on-trial": "On a trial now",
  "ending-7": "Trial ends in 7 days",
  ended: "Trial ended",
  never: "Never had a trial",
};

function pick<T extends string>(values: readonly T[], v: string | undefined): T | undefined {
  return values.find((x) => x === v);
}

export default async function PlatformAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; status?: string; trial?: string }>;
}) {
  const sp = await searchParams;
  const filters = {
    q: sp.q?.slice(0, 100),
    plan: pick(PLAN_VALUES, sp.plan),
    status: pick(STATUS_VALUES, sp.status),
    trial: pick(TRIAL_FILTERS, sp.trial),
  };
  const admin = await requirePlatformPage("accounts.view", {
    action: "console.accounts_listed",
    metadata: { filtered: Boolean(filters.q || filters.plan || filters.status || filters.trial) },
  });
  const accounts = await listAccounts(admin, filters);
  const q = filters.q;
  const filtered = Boolean(q || filters.plan || filters.status || filters.trial);

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every customer account, newest first. Open one to see its plan, payments and people."
        actions={
          <Button asChild variant="outline">
            <Link href="/platform/accounts/signups">Sign-ups waiting for a code</Link>
          </Button>
        }
      />
      <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="mb-1 block font-medium">
            Name
          </label>
          <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Search by name" />
        </div>
        <div>
          <label htmlFor="plan" className="mb-1 block font-medium">
            Plan
          </label>
          <NativeSelect id="plan" name="plan" defaultValue={filters.plan ?? ""}>
            <option value="">Any plan</option>
            {PLAN_VALUES.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block font-medium">
            Status
          </label>
          <NativeSelect id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any status</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="trial" className="mb-1 block font-medium">
            Trial
          </label>
          <NativeSelect id="trial" name="trial" defaultValue={filters.trial ?? ""}>
            <option value="">Any</option>
            {TRIAL_FILTERS.map((t) => (
              <option key={t} value={t}>
                {TRIAL_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex gap-3 sm:col-span-2 lg:col-span-5">
          <Button type="submit">Show accounts</Button>
          {filtered ? (
            <Button asChild variant="outline">
              <Link href="/platform/accounts">Clear filters</Link>
            </Button>
          ) : null}
        </div>
      </form>
      <p className="text-muted-foreground mb-3" aria-live="polite">
        {accounts.length} account{accounts.length === 1 ? "" : "s"}
      </p>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trial ends</TableHead>
              <TableHead>Paid until</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                  {filtered ? "No account matches these filters." : "No accounts yet."}
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
                  <TableCell>{a.trialEndsOn ? formatIsoDate(a.trialEndsOn) : "—"}</TableCell>
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
