import { Building2, CircleCheck, FileSpreadsheet, Settings2, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { WelcomeToast } from "@/components/app/welcome-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { greeting } from "@/domain/time/greeting";
import { formatDate } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings/service";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requirePageUser("occupancy.view");
  const firstName = user.name.split(" ")[0] ?? user.name;

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
      <EmptyState icon={FileSpreadsheet} title="Nothing needs your attention yet">
        {user.role === "VIEWER"
          ? "Unit occupancy by building will show here once buildings and units are added."
          : "Expiring leases, reminders to handle and overdue payments will show here once leases are added."}
      </EmptyState>
    </>
  );
}

async function GettingStarted() {
  const [userCount, settings] = await Promise.all([db.user.count(), getSettings()]);
  const steps = [
    {
      done: settings.companyName !== "Your Company",
      title: "Add your company name",
      text: "It appears on emails and printed summaries.",
      href: "/settings/general",
      icon: Settings2,
    },
    {
      done: userCount > 1,
      title: "Add the Leasing team",
      text: "Create accounts for Leasing Staff and Property Management.",
      href: "/settings/users",
      icon: UsersRound,
    },
    {
      done: false,
      title: "Add buildings and units",
      text: "Coming in the next update.",
      href: null,
      icon: Building2,
    },
  ];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>
          A few things to set up before the team starts using Propfolio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => {
            const body = (
              <>
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
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
                  <span className="block font-medium">
                    {step.title}
                    {step.done ? <span className="sr-only"> (done)</span> : null}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {step.done ? "Done" : step.text}
                  </span>
                </span>
              </>
            );
            return (
              <li key={step.title}>
                {step.href ? (
                  <Link
                    href={step.href}
                    className="hover:bg-muted/60 flex h-full items-start gap-3 rounded-lg border p-4"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex h-full items-start gap-3 rounded-lg border border-dashed p-4 opacity-80">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
