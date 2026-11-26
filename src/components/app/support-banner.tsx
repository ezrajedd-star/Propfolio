import { LifeBuoy, LogOut } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/(auth)/actions";
import { formatDateTime } from "@/domain/time/manila";

/**
 * Shown on every page while Propfolio support access is on. Staff in support mode see that
 * they are, with a way out; the customer's people see that support can get in, until when.
 */
export function SupportBanner({
  mode,
  until,
  staffName,
  canTurnOff,
}: {
  mode: "staff" | "customer";
  until: Date;
  staffName?: string;
  canTurnOff?: boolean;
}) {
  return (
    <div
      role="note"
      className="bg-primary-soft text-accent-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center font-medium lg:col-span-2"
    >
      <span className="flex items-center gap-2">
        <LifeBuoy className="size-4 shrink-0" aria-hidden />
        {mode === "staff"
          ? `Support mode: you are working as ${staffName ?? "Propfolio support"}. Every page you open and every change goes in this account's audit log. Access ends ${formatDateTime(until)}.`
          : `Propfolio support can access this account until ${formatDateTime(until)}.`}
      </span>
      {mode === "staff" ? (
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-1 underline underline-offset-4"
          >
            <LogOut className="size-4" aria-hidden /> Leave support mode
          </button>
        </form>
      ) : canTurnOff ? (
        <Link
          href="/settings/support-access"
          className="inline-flex min-h-10 items-center underline underline-offset-4"
        >
          Turn off
        </Link>
      ) : null}
    </div>
  );
}
