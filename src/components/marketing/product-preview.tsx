"use client";

import { Bell, CalendarClock, CheckCircle2, Mail, Receipt, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A live-looking, made-up preview of the app for the website: no real data, no requests. Tabs
 * switch between four screens; it moves on by itself every few seconds until someone picks a tab,
 * and never moves for people who ask their device for less motion.
 */
const TABS = [
  { key: "ending", label: "Leases ending", icon: CalendarClock },
  { key: "email", label: "Reminder email", icon: Mail },
  { key: "rent", label: "Rent schedule", icon: TrendingUp },
  { key: "payments", label: "Payments", icon: Receipt },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ROTATE_MS = 6000;

export function ProductPreview({ className }: { className?: string }) {
  const [active, setActive] = useState<TabKey>("ending");
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setActive((a) => TABS[(TABS.findIndex((x) => x.key === a) + 1) % TABS.length]!.key);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <figure
      className={cn("bg-card rounded-2xl border shadow-xl shadow-black/5", className)}
      aria-label="A preview of Propfolio, with sample data"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span aria-hidden className="size-3 rounded-full bg-red-300" />
        <span aria-hidden className="size-3 rounded-full bg-amber-300" />
        <span aria-hidden className="size-3 rounded-full bg-green-300" />
        <span className="text-muted-foreground ml-2 text-sm">Sample data</span>
      </div>
      <div
        role="tablist"
        aria-label="Preview screens"
        className="flex gap-1 overflow-x-auto border-b p-2"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`preview-tab-${t.key}`}
              aria-selected={on}
              aria-controls={`preview-panel-${t.key}`}
              onClick={() => {
                setActive(t.key);
                setAuto(false);
              }}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                on ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`preview-panel-${active}`}
        aria-labelledby={`preview-tab-${active}`}
        className="min-h-[340px] p-4 sm:p-5"
      >
        <div
          key={active}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
        >
          {active === "ending" ? <EndingScreen /> : null}
          {active === "email" ? <EmailScreen /> : null}
          {active === "rent" ? <RentScreen /> : null}
          {active === "payments" ? <PaymentsScreen /> : null}
        </div>
      </div>
    </figure>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "red" | "amber" | "green" | "teal";
  children: ReactNode;
}) {
  const tones = {
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-green-50 text-green-700 border-green-200",
    teal: "bg-primary-soft text-primary border-primary/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function EndingScreen() {
  const rows = [
    {
      unit: "Tower A · 1203",
      tenant: "Santos Trading",
      ends: "14 Dec 2026",
      days: 33,
      tone: "red" as const,
    },
    {
      unit: "Warehouse 4",
      tenant: "Luzon Cold Chain",
      ends: "30 Apr 2027",
      days: 170,
      tone: "amber" as const,
    },
    { unit: "Unit 2B", tenant: "M. Reyes", ends: "15 Jan 2027", days: 65, tone: "amber" as const },
    {
      unit: "Tower A · 0805",
      tenant: "Bayani Dental",
      ends: "31 Oct 2027",
      days: 354,
      tone: "green" as const,
    },
  ];
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Ending in 60 days" value="3" />
        <Stat label="Occupied" value="92%" />
        <Stat label="Vacant units" value="4" />
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map((r) => (
          <li key={r.unit} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.unit}</p>
              <p className="text-muted-foreground truncate text-sm">
                {r.tenant} · ends {r.ends}
              </p>
            </div>
            <Pill tone={r.tone}>Ends in {r.days} days</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmailScreen() {
  return (
    <div className="rounded-xl border">
      <div className="space-y-1 border-b p-3 text-sm">
        <p>
          <span className="text-muted-foreground">From:</span> Propfolio
        </p>
        <p>
          <span className="text-muted-foreground">Subject:</span>{" "}
          <span className="font-medium">3 leases need attention today</span>
        </p>
        <p className="text-muted-foreground">Today, 6:00 AM</p>
      </div>
      <div className="space-y-3 p-4">
        <p>Good morning. These leases are coming up:</p>
        {[
          ["Tower A · 1203, Santos Trading", "Ends in 30 days"],
          ["Unit 2B, M. Reyes", "Ends in 60 days"],
          ["Warehouse 4, Luzon Cold Chain", "Ends in 180 days"],
        ].map(([what, when]) => (
          <div
            key={what}
            className="bg-muted/60 flex items-center justify-between gap-3 rounded-lg p-3"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Bell className="text-primary size-4 shrink-0" aria-hidden />
              <span className="truncate">{what}</span>
            </span>
            <span className="text-sm font-semibold whitespace-nowrap">{when}</span>
          </div>
        ))}
        <span className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold">
          Open in Propfolio
        </span>
      </div>
    </div>
  );
}

function RentScreen() {
  const years = [
    ["Year 1", "₱50,000.00", 62],
    ["Year 2", "₱52,500.00", 68],
    ["Year 3", "₱55,125.00", 74],
    ["Year 4", "₱57,881.25", 81],
    ["Year 5", "₱60,775.31", 88],
  ] as const;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone="teal">5% a year</Pill>
        <Pill tone="teal">2 months deposit</Pill>
        <Pill tone="teal">1 month advance</Pill>
      </div>
      <ul className="space-y-2">
        {years.map(([y, amount, w]) => (
          <li key={y} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3">
            <span className="text-muted-foreground text-sm">{y}</span>
            <span className="bg-muted h-3 overflow-hidden rounded-full">
              <span className="bg-primary block h-full rounded-full" style={{ width: `${w}%` }} />
            </span>
            <span className="text-sm font-semibold tabular-nums">{amount}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-4 text-sm">
        Monthly rent, worked out to the centavo. Deposit ₱100,000.00 · Advance ₱50,000.00
      </p>
    </div>
  );
}

function PaymentsScreen() {
  return (
    <div>
      <div className="mb-4 grid grid-cols-4 gap-2 text-center">
        {[
          ["1–30", "₱45,000"],
          ["31–60", "₱12,500"],
          ["61–90", "₱0"],
          ["90+", "₱8,000"],
        ].map(([b, v]) => (
          <div key={b} className="rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">{b} days</p>
            <p className="text-sm font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y rounded-xl border">
        {[
          ["Santos Trading", "₱52,500.00", "Paid", "green"],
          ["M. Reyes", "₱12,500.00", "31 days late", "red"],
          ["Bayani Dental", "₱45,000.00", "Due 15 Nov", "amber"],
        ].map(([who, amt, status, tone]) => (
          <li key={who} className="flex items-center justify-between gap-3 p-3">
            <span className="flex min-w-0 items-center gap-2">
              {tone === "green" ? (
                <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-hidden />
              ) : (
                <Receipt className="text-muted-foreground size-4 shrink-0" aria-hidden />
              )}
              <span className="truncate font-medium">{who}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="hidden text-sm tabular-nums sm:inline">{amt}</span>
              <Pill tone={tone as "green" | "red" | "amber"}>{status}</Pill>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs leading-tight">{label}</p>
    </div>
  );
}
