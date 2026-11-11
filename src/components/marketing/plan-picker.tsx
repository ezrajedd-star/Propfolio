"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { recommendPlan } from "@/domain/marketing/recommend";
import { formatPeso } from "@/domain/money/money";
import { PLAN_CONFIG } from "@/domain/plans/plans";

const MAX_UNITS = 250;
const MAX_USERS = 6;

/** "Which plan do I need?": two sliders and a tick box, answered on the spot. */
export function PlanPicker() {
  const id = useId();
  const [units, setUnits] = useState(20);
  const [users, setUsers] = useState(1);
  const [payments, setPayments] = useState(false);
  const r = recommendPlan(units, users, { payments });

  return (
    <div className="bg-card grid gap-8 rounded-3xl border p-6 shadow-sm sm:p-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-8">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor={`${id}-units`} className="text-lg font-semibold">
              How many units do you lease out?
            </label>
            <output htmlFor={`${id}-units`} className="text-2xl font-semibold tabular-nums">
              {units >= MAX_UNITS ? `${MAX_UNITS}+` : units}
            </output>
          </div>
          <input
            id={`${id}-units`}
            type="range"
            min={1}
            max={MAX_UNITS}
            value={units}
            onChange={(e) => setUnits(Number(e.target.value))}
            className="accent-primary mt-3 h-10 w-full cursor-pointer"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor={`${id}-users`} className="text-lg font-semibold">
              How many people will sign in?
            </label>
            <output htmlFor={`${id}-users`} className="text-2xl font-semibold tabular-nums">
              {users >= MAX_USERS ? `${MAX_USERS - 1}+` : users}
            </output>
          </div>
          <input
            id={`${id}-users`}
            type="range"
            min={1}
            max={MAX_USERS}
            value={users}
            onChange={(e) => setUsers(Number(e.target.value))}
            className="accent-primary mt-3 h-10 w-full cursor-pointer"
          />
        </div>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-lg">
          <input
            type="checkbox"
            checked={payments}
            onChange={(e) => setPayments(e.target.checked)}
            className="accent-primary size-5"
          />
          I want to record payments and see who&apos;s overdue
        </label>
      </div>

      <div
        aria-live="polite"
        className="bg-primary-soft flex flex-col justify-center rounded-2xl p-6 text-center"
      >
        <p className="text-primary flex items-center justify-center gap-2 font-semibold">
          <Sparkles className="size-4" aria-hidden /> We suggest
        </p>
        {r.kind === "plan" ? (
          <>
            <p className="mt-2 text-4xl font-semibold">{PLAN_CONFIG[r.plan].label}</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatPeso(PLAN_CONFIG[r.plan].pricePerMonth)}
              <span className="text-muted-foreground text-base font-normal"> a month</span>
            </p>
            <p className="text-muted-foreground mt-3">{r.reason}</p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/signup">
                Start free <ArrowRight aria-hidden />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold">A larger plan</p>
            <p className="text-muted-foreground mt-3">{r.reason}</p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/contact#demo">Talk to us</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
