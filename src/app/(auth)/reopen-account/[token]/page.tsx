import type { Metadata } from "next";
import Link from "next/link";

import { formatIsoDate } from "@/domain/time/manila";
import { reopenableAccount } from "@/server/accounts/closing";
import { ReopenForm } from "./reopen-form";

export const metadata: Metadata = { title: "Reopen your account" };
export const dynamic = "force-dynamic";

/** The link from the "Your Propfolio account is closed" email. */
export default async function ReopenAccountPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const account = await reopenableAccount(token);
  return (
    <div className="space-y-6">
      {account ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold">Reopen {account.name}?</h1>
            <p className="text-muted-foreground mt-2">
              Everything comes back as it was: buildings, tenants, leases, payments and documents.
              You can reopen it until {formatIsoDate(account.deleteAfter)}.
            </p>
          </div>
          <ReopenForm token={token} />
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">This link no longer works</h1>
          <p className="text-muted-foreground">
            It was already used, or the account&apos;s data has been deleted. If you think
            that&apos;s wrong, please{" "}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              contact us
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
