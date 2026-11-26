import type { StaffLogKind } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_ROLE_LABELS } from "@/domain/platform/roles";
import { formatDateTime } from "@/domain/time/manila";
import { isUuid } from "@/server/db-errors";
import { requirePlatformPage } from "@/server/platform/current";
import { listStaff } from "@/server/platform/staff";
import { listStaffLog } from "@/server/platform/staff-log";

export const metadata: Metadata = { title: "Staff log" };

const KINDS: { value: StaffLogKind; label: string }[] = [
  { value: "VIEW", label: "Looked at" },
  { value: "CHANGE", label: "Changed" },
  { value: "EXPORT", label: "Exported or downloaded" },
  { value: "SETTING", label: "Setting or staff change" },
  { value: "SIGN_IN", label: "Sign-in" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<
  StaffLogKind,
  string
>;

/** Plain words for common actions; anything else shows its code. */
const ACTIONS: Record<string, string> = {
  "console.today_viewed": "Opened Today",
  "console.accounts_listed": "Opened the accounts list",
  "console.account_viewed": "Opened an account",
  "console.staff_viewed": "Opened Staff",
  "console.stafflog_viewed": "Opened the staff log",
  "platform.login": "Signed in",
  "platform.logout": "Signed out",
  "platform.login_failed": "Failed sign-in",
  "platform.setup_link_issued": "Set-up link made",
  "platform.setup_completed": "Finished set-up",
  "platform.trial_extended": "Extended a trial",
  "platform.manual_payment": "Recorded a bank transfer",
  "platform.account_suspended": "Suspended an account",
  "platform.account_reactivated": "Reactivated an account",
  "platform.plan_changed": "Changed a plan",
  "platform.account_reopened": "Reopened an account",
  "platform.payments_export": "Exported payments",
  "staff.added": "Added a staff member",
  "staff.role_changed": "Changed a staff role",
  "staff.deactivated": "Turned off a staff member",
  "staff.reactivated": "Turned a staff member back on",
  "staff.sign_in_reset": "Reset a staff member's sign-in",
};

export default async function StaffLogPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; kind?: string; before?: string }>;
}) {
  const admin = await requirePlatformPage("stafflog.view", { action: "console.stafflog_viewed" });
  const sp = await searchParams;
  const kind = KINDS.find((k) => k.value === sp.kind)?.value;
  const who = sp.who && isUuid(sp.who) ? sp.who : undefined;
  const before = sp.before && /^\d{1,19}$/.test(sp.before) ? BigInt(sp.before) : undefined;
  const [log, staff] = await Promise.all([
    listStaffLog(admin, { adminId: who, kind, before }),
    listStaff(admin),
  ]);
  const next = new URLSearchParams({
    ...(who ? { who } : {}),
    ...(kind ? { kind } : {}),
    before: log.rows.at(-1)?.seq ?? "",
  });

  return (
    <>
      <PageHeader
        title="Staff log"
        description="Everything Propfolio staff looked at, changed, exported or set in this console. Nothing here can be edited or deleted."
      />
      <form className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="who" className="mb-1 block font-medium">
            Who
          </label>
          <NativeSelect id="who" name="who" defaultValue={who ?? ""}>
            <option value="">Everyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor="kind" className="mb-1 block font-medium">
            What
          </label>
          <NativeSelect id="kind" name="kind" defaultValue={kind ?? ""}>
            <option value="">Everything</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-end gap-3">
          <Button type="submit">Show</Button>
          {who || kind ? (
            <Button asChild variant="outline">
              <Link href="/platform/staff-log">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead>Account</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {log.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  Nothing yet.
                </TableCell>
              </TableRow>
            ) : (
              log.rows.map((r) => (
                <TableRow key={r.seq} className="align-top">
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.at)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.adminName ?? "System"}</div>
                    {r.adminRole ? (
                      <div className="text-muted-foreground text-sm">
                        {PLATFORM_ROLE_LABELS[r.adminRole]}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{KIND_LABEL[r.kind]}</TableCell>
                  <TableCell>{ACTIONS[r.action] ?? r.action}</TableCell>
                  <TableCell>
                    {r.accountId ? (
                      <Link
                        href={`/platform/accounts/${r.accountId}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Open account
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {log.more ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/platform/staff-log?${next.toString()}`}>Older entries</Link>
        </Button>
      ) : null}
    </>
  );
}
