import { Download, FileSpreadsheet, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { CLOSED_KEEP_DAYS, deleteAfterFor } from "@/domain/accounts/closing";
import { formatIsoDate, manilaToday } from "@/domain/time/manila";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { CloseAccount } from "./close-account";

export const metadata: Metadata = { title: "Your data" };

/** The Owner: download everything, or close the account. */
export default async function YourDataPage() {
  const actor = await requirePageUser("billing.manage", { duringReadOnly: true });
  const account = await db.account.findUniqueOrThrow({
    where: { id: actor.accountId },
    select: { name: true },
  });
  return (
    <>
      <PageHeader
        title="Your data"
        description="Download everything in your account, or close it. Only the Owner sees this page."
      />
      <section className="bg-card mb-6 max-w-3xl rounded-xl border p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <FileSpreadsheet className="text-primary size-5" aria-hidden /> Download all your data
        </h2>
        <p className="text-muted-foreground mt-2">
          One Excel file with your buildings, units, tenants, leases, charges and payments, on every
          plan. The first four sheets can be imported into Propfolio again. It holds tenants&apos;
          personal details: keep it safe.
        </p>
        <Button asChild className="mt-4">
          <a href="/api/v1/account/export" download>
            <Download aria-hidden /> Download all data (Excel)
          </a>
        </Button>
      </section>

      <section className="border-destructive/40 max-w-3xl rounded-xl border p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldAlert className="text-destructive size-5" aria-hidden /> Close this account
        </h2>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-6">
          <li>Everyone is signed out, and no more emails or charges go out.</li>
          <li>
            You can reopen it, with everything as it was, for {CLOSED_KEEP_DAYS} days (until{" "}
            {formatIsoDate(deleteAfterFor(manilaToday()))}). We email you a reopen link, and a
            reminder a week before the end.
          </li>
          <li>After that, all its data and files are deleted for good.</li>
          <li>Download your data first if you want to keep a copy.</li>
        </ul>
        <div className="mt-4">
          <CloseAccount
            accountName={account.name}
            deleteAfter={formatIsoDate(deleteAfterFor(manilaToday()))}
          />
        </div>
      </section>
    </>
  );
}
