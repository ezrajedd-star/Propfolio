import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { FEATURES, type FeatureKey } from "@/domain/marketing/content";
import { cn } from "@/lib/utils";
import { FEATURE_ICONS } from "./feature-icons";
import { Reveal } from "./reveal";

const feature = (k: FeatureKey) => FEATURES.find((f) => f.key === k)!;

/** Small drawings inside the larger tiles (sample data, decorative). */
function ReminderArt() {
  return (
    <div aria-hidden className="mt-6 space-y-2">
      {[
        ["180 days", "Warehouse 4", "w-[90%]"],
        ["60 days", "Unit 2B", "w-[60%]"],
        ["30 days", "Tower A · 1203", "w-[35%]"],
        ["7 days", "Shop 3", "w-[12%]"],
      ].map(([d, u, w]) => (
        <div key={d} className="flex items-center gap-3">
          <span className="text-muted-foreground w-16 shrink-0 text-xs">{d}</span>
          <span className="bg-muted relative h-7 flex-1 overflow-hidden rounded-md">
            <span className={cn("bg-primary/15 absolute inset-y-0 left-0 rounded-md", w)} />
            <span className="relative flex h-full items-center px-2 text-xs font-medium">{u}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function CalendarArt() {
  const marked: Record<number, string> = {
    3: "bg-primary",
    11: "bg-amber-400",
    17: "bg-primary",
    24: "bg-red-400",
    28: "bg-amber-400",
  };
  return (
    <div aria-hidden className="mt-6 grid grid-cols-7 gap-1">
      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
        <span
          key={d}
          className="bg-muted/70 relative flex aspect-square items-center justify-center rounded text-[11px]"
        >
          {d}
          {marked[d] ? (
            <span className={cn("absolute bottom-1 size-1.5 rounded-full", marked[d])} />
          ) : null}
        </span>
      ))}
    </div>
  );
}

function ImportArt() {
  return (
    <div aria-hidden className="mt-6 flex items-center gap-3 text-sm">
      <span className="rounded-lg border bg-green-50 px-3 py-2 font-medium text-green-800">
        My units.xlsx
      </span>
      <ArrowRight className="text-muted-foreground size-4" />
      <span className="bg-primary-soft text-primary rounded-lg px-3 py-2 font-medium">
        48 leases ✓
      </span>
    </div>
  );
}

function Tile({
  k,
  className,
  art,
  delay,
}: {
  k: FeatureKey;
  className?: string;
  art?: ReactNode;
  delay?: number;
}) {
  const f = feature(k);
  const Icon = FEATURE_ICONS[k];
  return (
    <Reveal delay={delay} className={cn("h-full", className)}>
      <div className="bg-card group hover:border-primary/40 flex h-full flex-col rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0">
        <span className="bg-primary-soft text-primary mb-4 inline-flex size-11 items-center justify-center rounded-xl">
          <Icon className="size-5" aria-hidden />
        </span>
        <h3 className="text-xl font-semibold">{f.title}</h3>
        <p className="text-muted-foreground mt-2">{f.summary}</p>
        {art}
      </div>
    </Reveal>
  );
}

/** The modular feature grid on the home page. */
export function FeatureBento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Tile k="reminders" className="md:col-span-4" art={<ReminderArt />} />
      <Tile k="calendar" className="md:col-span-2" art={<CalendarArt />} delay={80} />
      <Tile k="rent" className="md:col-span-2" delay={0} />
      <Tile k="payments" className="md:col-span-2" delay={80} />
      <Tile k="privacy" className="md:col-span-2" delay={160} />
      <Tile k="import" className="md:col-span-3" art={<ImportArt />} />
      <Tile k="reports" className="md:col-span-3" delay={80} />
      <div className="md:col-span-6">
        <Link
          href="/product"
          className="text-primary inline-flex min-h-10 items-center gap-2 font-semibold underline-offset-4 hover:underline"
        >
          See every feature <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
