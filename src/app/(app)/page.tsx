import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleCheck,
  FileSpreadsheet,
  RefreshCw,
  Settings2,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { LeaseStatusBadge } from "@/components/app/lease-badges";
import { OccupancyBar } from "@/components/app/occupancy-bar";
import { PageHeader } from "@/components/app/page-header";
import { WelcomeToast } from "@/components/app/welcome-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { greeting } from "@/domain/time/greeting";
import { formatDate, formatIsoDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/current";
import { getDashboard } from "@/server/dashboard";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings/service";

export const metadata: Metadata = { title: "Home" };

function SummaryCard({
  href,
  icon: Icon,
  label,
  value,
  tone,
}: {
  href?: string;
  icon: typeof CircleCheck;
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const tones = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    neutral: "bg-neutral-soft text-neutral-status",
  };
  const body = (
    <>
      <span className={cn("flex size-11 items-center justify-center rounded-full", tones[tone])}>
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="mt-4 block text-3xl font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground mt-1 block">{label}</span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="bg-card hover:bg-muted/50 block rounded-xl border p-5 shadow-sm transition-colors"
    >
      {body}
    </Link>
  ) : (
    <div className="bg-card rounded-xl border border-dashed p-5">{body}</div>
  );
}

export default async function HomePage() {
  const user = await requirePageUser("occupancy.view");
  const firstName = user.name.split(" ")[0] ?? user.name;
  const dash = await getDashboard(user);

  return (
    <>
      <Suspense>
        <WelcomeToast />
      </Suspense>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Today is ${formatDate(new Date())}.`}
      />
      {user.role === "ADMIN" ? <GettingStarted /> : null}

      {dash.leases ? (
        <>
          <section aria-labelledby="attention" className="mb-8">
            <h2 id="attention" className="mb-3 text-xl font-semibold">
              What needs your attention
            </h2>
            {dash.leases.expiringSoon.length === 0 ? (
              <p className="bg-card flex items-center gap-2 rounded-xl border p-4">
                <CircleCheck className="text-success size-5" aria-hidden /> Nothing urgent. No
                leases end in the next 30 days.
              </p>
            ) : (
              <ul className="bg-card divide-y rounded-xl border">
                {dash.leases.expiringSoon.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 p-4">
                    <AlertTriangle className="text-warning size-5" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {l.tenant.displayName} · Unit {l.unit.unitNumber}, {l.building.name}
                      </p>
                      <p className="text-muted-foreground">
                        {l.timeLeft} ({formatIsoDate(l.terminationDate ?? l.endDate)})
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/leases/${l.id}`}>Open lease</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/leases/${l.id}/renew`}>
                        <RefreshCw aria-hidden /> Renew
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Summary" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              href="/leases?status=CURRENT"
              icon={CircleCheck}
              label="Active leases"
              value={String(dash.leases.active)}
              tone="success"
            />
            <SummaryCard
              href="/leases?ending=90"
              icon={CalendarClock}
              label="Ending in the next 90 days"
              value={String(dash.leases.expiringIn90)}
              tone="warning"
            />
            <SummaryCard
              href="/leases?status=EXPIRED"
              icon={AlertTriangle}
              label="Expired, not renewed"
              value={String(dash.leases.expiredNotRenewed)}
              tone="danger"
            />
            <SummaryCard
              icon={Wallet}
              label="Total overdue — available once payments are added"
              value="—"
              tone="neutral"
            />
          </section>
        </>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Occupancy by building</CardTitle>
            <CardDescription>Based on leases covering today.</CardDescription>
          </CardHeader>
          <CardContent>
            {dash.buildings.length === 0 ? (
              <p className="text-muted-foreground">No buildings yet.</p>
            ) : (
              <ul className="space-y-6">
                {dash.buildings.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/units?building=${b.id}`}
                      className="mb-2 inline-block font-medium hover:underline"
                    >
                      {b.name}
                    </Link>
                    <OccupancyBar counts={b.occupancy} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {dash.leases ? (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming expiries</CardTitle>
              <CardDescription>Leases ending in the next 90 days.</CardDescription>
            </CardHeader>
            <CardContent>
              {dash.leases.upcomingExpiries.length === 0 ? (
                <p className="text-muted-foreground">No leases end in the next 90 days.</p>
              ) : (
                <ul className="divide-y">
                  {dash.leases.upcomingExpiries.map((l) => (
                    <li
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <Link href={`/leases/${l.id}`} className="min-w-0">
                        <span className="block font-medium hover:underline">
                          {l.tenant.displayName}
                        </span>
                        <span className="text-muted-foreground block text-sm">
                          Unit {l.unit.unitNumber} · {formatIsoDate(l.terminationDate ?? l.endDate)}{" "}
                          · {l.timeLeft}
                        </span>
                      </Link>
                      <LeaseStatusBadge status={l.status} />
                    </li>
                  ))}
                </ul>
              )}
              {dash.leases.expiringIn90 > dash.leases.upcomingExpiries.length ? (
                <Link
                  href="/leases?ending=90"
                  className="text-primary mt-3 inline-block hover:underline"
                >
                  See all {dash.leases.expiringIn90} →
                </Link>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Units</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                See every unit, who is in it and when their lease ends.
              </p>
              <Button asChild>
                <Link href="/units">Open units</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      {dash.buildings.length === 0 && user.role !== "ADMIN" ? (
        <div className="mt-8">
          <EmptyState icon={FileSpreadsheet} title="Nothing here yet">
            An Admin needs to add buildings and units first.
          </EmptyState>
        </div>
      ) : null}
    </>
  );
}

async function GettingStarted() {
  const [userCount, buildingCount, leaseCount, settings] = await Promise.all([
    db.user.count(),
    db.building.count({ where: { archivedAt: null } }),
    db.lease.count({ where: { archivedAt: null } }),
    getSettings(),
  ]);
  const steps = [
    {
      done: settings.companyName !== "Your Company",
      title: "Add your company name",
      href: "/settings/general",
      icon: Settings2,
    },
    {
      done: settings.dpoEmail !== "privacy@example.com",
      title: "Name your privacy officer",
      href: "/settings/privacy",
      icon: Settings2,
    },
    {
      done: userCount > 1,
      title: "Add the Leasing team",
      href: "/settings/users",
      icon: UsersRound,
    },
    {
      done: buildingCount > 0,
      title: "Add buildings and units",
      href: "/settings/buildings",
      icon: Building2,
    },
    {
      done: leaseCount > 0,
      title: "Add your first lease",
      href: "/leases/new",
      icon: FileSpreadsheet,
    },
  ];
  if (steps.every((s) => s.done)) return null;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>
          A few things to set up before the team starts using Propfolio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step) => (
            <li key={step.title}>
              <Link
                href={step.href}
                className="hover:bg-muted/60 flex h-full items-start gap-3 rounded-lg border p-4"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    step.done ? "bg-success-soft text-success" : "bg-primary-soft text-primary",
                  )}
                >
                  {step.done ? (
                    <CircleCheck className="size-5" aria-hidden />
                  ) : (
                    <step.icon className="size-5" aria-hidden />
                  )}
                </span>
                <span>
                  <span className="block font-medium">{step.title}</span>
                  <span className="text-muted-foreground block text-sm">
                    {step.done ? "Done" : "To do"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
