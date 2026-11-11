import { CheckCircle2, CircleAlert, CircleHelp, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/components/marketing/section";
import { STATE_LABELS, overallStatus, type ServiceState } from "@/domain/marketing/status";
import { formatDateTime } from "@/domain/time/manila";
import { cn } from "@/lib/utils";
import { getSystemStatus } from "@/server/status";

export const metadata: Metadata = {
  title: "System status",
  description: "Whether Propfolio and its daily reminder emails are working right now.",
};

// Checked fresh on every visit.
export const dynamic = "force-dynamic";

const STYLE: Record<ServiceState, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-success bg-success-soft border-success/30" },
  degraded: { icon: CircleAlert, className: "text-warning bg-warning-soft border-warning/30" },
  down: { icon: XCircle, className: "text-destructive bg-red-50 border-red-200" },
  unknown: { icon: CircleHelp, className: "text-muted-foreground bg-muted border-border" },
};

export default async function StatusPage() {
  const now = new Date();
  const services = await getSystemStatus(now);
  const overall = overallStatus(services);
  const O = STYLE[overall.state];
  return (
    <>
      <section className="px-4 pt-14 pb-2 sm:pt-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">Status</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">System status</h1>
          <div
            className={cn(
              "mt-6 flex items-center gap-3 rounded-2xl border p-5 text-xl font-semibold",
              O.className,
            )}
          >
            <O.icon className="size-7 shrink-0" aria-hidden />
            {overall.text}
          </div>
          <p className="text-muted-foreground mt-3">
            Checked {formatDateTime(now)} (Philippine time).
          </p>
        </div>
      </section>
      <Section className="pt-6">
        <ul className="mx-auto max-w-3xl divide-y rounded-2xl border">
          {services.map((s) => {
            const St = STYLE[s.state];
            return (
              <li key={s.name} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <h2 className="text-lg font-semibold">{s.name}</h2>
                  <p className="text-muted-foreground">{s.detail}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold",
                    St.className,
                  )}
                >
                  <St.icon className="size-4" aria-hidden /> {STATE_LABELS[s.state]}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground mx-auto mt-6 max-w-3xl">
          If this page doesn&apos;t open at all, Propfolio itself is down. Please{" "}
          <Link href="/contact" className="text-primary underline underline-offset-4">
            contact us
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
