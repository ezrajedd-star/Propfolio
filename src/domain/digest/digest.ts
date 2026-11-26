/** The Monday digest's comparisons, in plain words. Pure. */
import Decimal from "decimal.js";

import { formatPeso } from "@/domain/money/money";

export interface DigestNumbers {
  signUpsLastWeek: number;
  payingTotal: number;
  mrr: string;
  trialsEndingIn7Days: number;
  cancellationsThisMonth: number;
  openTickets: number;
  ticketsOpenedLastWeek: number;
  approvalsWaiting: number;
  openIncidents: number;
  incidentsLastWeek: number;
}

export interface DigestRow {
  label: string;
  now: string;
  change: string | null;
}

function diff(now: number, before: number | undefined, unit = ""): string | null {
  if (before === undefined) return null;
  const d = now - before;
  if (d === 0) return "same as last week";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}${unit} vs last week`;
}

function moneyDiff(now: string, before: string | undefined): string | null {
  if (before === undefined) return null;
  const d = new Decimal(now).minus(before);
  if (d.isZero()) return "same as last week";
  return `${d.isPositive() ? "+" : "−"}${formatPeso(d.abs())} vs last week`;
}

const peso = (v: string) => formatPeso(v);

/** The numbers table: this week, and the change since last week's digest (if there was one). */
export function digestRows(now: DigestNumbers, before?: Partial<DigestNumbers>): DigestRow[] {
  return [
    {
      label: "Sign-ups last week",
      now: String(now.signUpsLastWeek),
      change: diff(now.signUpsLastWeek, before?.signUpsLastWeek),
    },
    {
      label: "Paying customers",
      now: String(now.payingTotal),
      change: diff(now.payingTotal, before?.payingTotal),
    },
    {
      label: "Monthly recurring revenue",
      now: peso(now.mrr),
      change: moneyDiff(now.mrr, before?.mrr),
    },
    {
      label: "Trials ending in the next 7 days",
      now: String(now.trialsEndingIn7Days),
      change: null,
    },
    { label: "Cancellations this month", now: String(now.cancellationsThisMonth), change: null },
    {
      label: "Open tickets",
      now: String(now.openTickets),
      change: diff(now.openTickets, before?.openTickets),
    },
    {
      label: "New tickets last week",
      now: String(now.ticketsOpenedLastWeek),
      change: diff(now.ticketsOpenedLastWeek, before?.ticketsOpenedLastWeek),
    },
    { label: "Approvals waiting", now: String(now.approvalsWaiting), change: null },
    { label: "Open incidents", now: String(now.openIncidents), change: null },
    {
      label: "Incidents last week",
      now: String(now.incidentsLastWeek),
      change: diff(now.incidentsLastWeek, before?.incidentsLastWeek),
    },
  ];
}

/** Things that need the founder this week, in order of urgency. */
export function attentionItems(n: DigestNumbers): string[] {
  const items: string[] = [];
  if (n.openIncidents > 0)
    items.push(`${n.openIncidents} incident${n.openIncidents === 1 ? " is" : "s are"} still open.`);
  if (n.approvalsWaiting > 0)
    items.push(
      `${n.approvalsWaiting} approval${n.approvalsWaiting === 1 ? " is" : "s are"} waiting for you.`,
    );
  if (n.openTickets > 0)
    items.push(`${n.openTickets} ticket${n.openTickets === 1 ? " is" : "s are"} open.`);
  if (n.trialsEndingIn7Days > 0)
    items.push(
      `${n.trialsEndingIn7Days} trial${n.trialsEndingIn7Days === 1 ? " ends" : "s end"} this week: a good time to call.`,
    );
  return items;
}
