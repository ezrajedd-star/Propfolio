import type { Metadata } from "next";
import Link from "next/link";

import { PLAN_CONFIG, TRIAL_DAYS } from "@/domain/plans/plans";
import { GRACE_DAYS } from "@/domain/subscription/subscription";

export const metadata: Metadata = { title: "Refunds and cancellation" };

/**
 * How cancelling works is a fact of the product (written here). Whether and when money is refunded
 * is a business and legal decision: it stays marked for the lawyer.
 */
export default function RefundsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold">Refunds and cancellation</h1>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Free trial</h2>
        <p>
          New accounts get Premium free for {TRIAL_DAYS} days. No card is asked for, so nothing is
          charged when the trial ends: the account simply moves to the Free plan.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Cancelling</h2>
        <p>
          The account&apos;s Owner can cancel at any time on the Plan page. Nothing more is charged.
          The paid plan continues until the end of the month already paid for; then the account
          moves to Free. Nothing is deleted: everything stays visible, and exports and the privacy
          tools keep working. With more than {PLAN_CONFIG.FREE.units} units the account is read-only
          until it upgrades again.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Changing plans</h2>
        <p>
          An upgrade applies straight away, and only the difference for the rest of the current
          month is charged. A downgrade applies from the next month, at the lower price.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Failed payments</h2>
        <p>
          If a monthly payment fails, the plan continues for {GRACE_DAYS} days while the Owner
          updates the payment. After that the account moves to Free; nothing is deleted.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Refunds</h2>
        <div className="border-warning bg-warning-soft text-warning rounded-lg border p-4 font-medium">
          [LAWYER TO SUPPLY] When payments are refunded (for example a charge made in error, or a
          duplicate payment), how to ask, and how long it takes.
        </div>
      </section>
      <p>
        Questions?{" "}
        <Link href="/contact" className="text-primary underline underline-offset-4">
          Contact us
        </Link>
        .
      </p>
    </article>
  );
}
