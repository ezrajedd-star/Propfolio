/**
 * Ranking leads for the "talk to today" list by buying signals (weights in src/config/ops.ts).
 * Pure: the server gathers the facts.
 */
import { BUYING_SIGNALS } from "@/config/ops";
import { daysBetween, type IsoDate } from "@/domain/time/calendar-date";
import type { LeadSource, LeadStage } from "./pipeline";

export interface LeadFacts {
  stage: LeadStage;
  source: LeadSource;
  portfolioSize: number | null;
  nextFollowUp: IsoDate | null;
  /** Days since the last timeline entry. */
  daysSinceActivity: number;
  /** Days since they asked for a demo, if they did. */
  demoRequestedDaysAgo: number | null;
  account: {
    trialDaysLeft: number | null;
    units: number;
    leases: number;
    /** Days since anyone in the account used Propfolio. */
    daysSinceActive: number | null;
  } | null;
}

export interface Ranked {
  score: number;
  reasons: string[];
}

type Signals = { [K in keyof typeof BUYING_SIGNALS]: number };

export function scoreLead(f: LeadFacts, today: IsoDate, w: Signals = BUYING_SIGNALS): Ranked {
  if (f.stage === "LOST" || f.stage === "PAYING") return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    if (points <= 0) return;
    score += points;
    reasons.push(reason);
  };
  const a = f.account;
  if (
    a?.trialDaysLeft !== null &&
    a?.trialDaysLeft !== undefined &&
    a.trialDaysLeft <= w.trialEndingDays
  ) {
    add(
      w.trialEnding,
      a.trialDaysLeft === 0
        ? "Trial ends today"
        : `Trial ends in ${a.trialDaysLeft} day${a.trialDaysLeft === 1 ? "" : "s"}`,
    );
  }
  if (a && a.units > 0 && a.leases === 0) {
    add(w.unitsButNoLeases, `Added ${a.units} unit${a.units === 1 ? "" : "s"} but no leases yet`);
  }
  if (f.demoRequestedDaysAgo !== null && f.demoRequestedDaysAgo <= w.demoRequestDays) {
    add(
      w.demoRequest,
      f.demoRequestedDaysAgo === 0
        ? "Asked for a demo today"
        : `Asked for a demo ${f.demoRequestedDaysAgo} day${f.demoRequestedDaysAgo === 1 ? "" : "s"} ago`,
    );
  }
  if (f.nextFollowUp && daysBetween(f.nextFollowUp, today) >= 0) {
    add(
      w.followUpDue,
      f.nextFollowUp === today ? "Follow-up is due today" : "Follow-up is overdue",
    );
  }
  if (
    a?.daysSinceActive !== null &&
    a?.daysSinceActive !== undefined &&
    a.daysSinceActive <= w.recentlyActiveDays
  ) {
    add(w.recentlyActive, "Used Propfolio in the last few days");
  }
  if (f.daysSinceActivity >= w.quietDays) {
    add(w.quiet, `No contact for ${f.daysSinceActivity} days`);
  }
  if (f.source === "REFERRAL") add(w.referral, "Came by referral");
  const units = Math.max(f.portfolioSize ?? 0, a?.units ?? 0);
  if (units >= 10) {
    add(Math.min(w.portfolioMax, Math.floor(units / 10) * w.per10Units), `About ${units} units`);
  }
  return { score, reasons };
}

export function rankLeads<T extends { facts: LeadFacts }>(
  leads: readonly T[],
  today: IsoDate,
  size: number = BUYING_SIGNALS.listSize,
): (T & Ranked)[] {
  return leads
    .map((l) => ({ ...l, ...scoreLead(l.facts, today) }))
    .filter((l) => l.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, size);
}
