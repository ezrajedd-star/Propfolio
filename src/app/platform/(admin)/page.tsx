import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { PLAN_CONFIG, PLANS } from "@/domain/plans/plans";
import { versusLastWeek } from "@/domain/platform/today";
import { formatPeso } from "@/domain/money/money";
import { formatDate } from "@/domain/time/manila";
import { requirePlatformPage } from "@/server/platform/current";
import { getTodayMetrics } from "@/server/platform/today";

export const metadata: Metadata = { title: "Today" };

function Tile({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-muted-foreground block font-medium">{label}</span>
      <span className="mt-1 block text-3xl font-semibold tabular-nums">{value}</span>
      {note ? <span className="text-muted-foreground mt-1 block">{note}</span> : null}
    </>
  );
  return (
    <li className="bg-card rounded-xl border">
      {href ? (
        <Link href={href} className="hover:bg-muted/50 block h-full rounded-xl p-4">
          {body}
        </Link>
      ) : (
        <div className="p-4">{body}</div>
      )}
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = title.toLowerCase().replace(/\W+/g, "-");
  return (
    <section aria-labelledby={id} className="mb-8">
      <h2 id={id} className="mb-3 text-xl font-semibold">
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</ul>
    </section>
  );
}

export default async function TodayPage() {
  const admin = await requirePlatformPage("console.view", { action: "console.today_viewed" });
  const m = await getTodayMetrics(admin);
  const pct = (n: number) =>
    m.funnel.started > 0 ? `${Math.round((n / m.funnel.started) * 100)}% of sign-ups` : "—";

  return (
    <>
      <PageHeader
        title="Today"
        description={`How Propfolio is doing, ${formatDate(new Date())}.`}
      />

      <Section title="Needs attention">
        <Tile
          label="Open tickets"
          value={m.tickets ? m.tickets.open : "—"}
          note={
            m.tickets
              ? `${m.tickets.under1d} under a day · ${m.tickets.oneTo3d} 1–3 days · ${m.tickets.over3d} over 3 days`
              : "Tickets aren't set up yet"
          }
          href={m.tickets ? "/platform/tickets" : undefined}
        />
        <Tile
          label="Approvals waiting"
          value={m.approvalsWaiting ?? "—"}
          note={m.approvalsWaiting === undefined ? "Approvals aren't set up yet" : undefined}
          href={m.approvalsWaiting === undefined ? undefined : "/platform/approvals"}
        />
        <Tile
          label="Open incidents"
          value={m.openIncidents ?? "—"}
          note={
            m.openIncidents === undefined
              ? "Monitoring isn't set up yet"
              : m.openIncidents === 0
                ? "All systems normal"
                : "See System health"
          }
          href={m.openIncidents === undefined ? undefined : "/platform/health"}
        />
        <Tile
          label="Trials ending in 7 days"
          value={m.trialsEndingIn7Days}
          note="Good people to call"
          href="/platform/accounts?trial=ending-7"
        />
      </Section>

      <Section title="Sign-ups">
        <Tile label="Today" value={m.signUps.today} />
        <Tile
          label="This week"
          value={m.signUps.thisWeek}
          note={versusLastWeek(m.signUps.thisWeek, m.signUps.lastWeek)}
        />
      </Section>

      <Section title="Money">
        <Tile
          label="Monthly recurring revenue"
          value={formatPeso(m.mrr)}
          note="List prices of paying customers"
        />
        <Tile label="Paying customers" value={m.payingTotal} />
        {PLANS.filter((p) => p !== "FREE").map((p) => (
          <Tile
            key={p}
            label={`On ${PLAN_CONFIG[p].label}`}
            value={m.payingByPlan[p]}
            href={`/platform/accounts?plan=${p}`}
          />
        ))}
        <Tile label="Cancellations this month" value={m.cancellationsThisMonth} />
      </Section>

      <Section title={`Sign-up journey, this month (${m.funnel.days} days)`}>
        <Tile label="1. Started sign-up" value={m.funnel.started} note="Filled in the form" />
        <Tile
          label="2. Verified their email"
          value={m.funnel.verified}
          note={pct(m.funnel.verified)}
        />
        <Tile label="3. Added a unit" value={m.funnel.firstUnit} note={pct(m.funnel.firstUnit)} />
        <Tile
          label="4. Added a lease"
          value={m.funnel.firstLease}
          note={pct(m.funnel.firstLease)}
        />
      </Section>
    </>
  );
}
