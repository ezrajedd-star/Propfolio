import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { render } from "@react-email/components";

import { AGENTS, AGENT_KEYS, ACTION_TYPE_LABELS, type ActionType } from "@/config/agents";
import { formatUsd } from "@/domain/agents/cost";
import { attentionItems, digestRows, type DigestNumbers } from "@/domain/digest/digest";
import { manilaPeriods } from "@/domain/platform/today";
import { addDays, toDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { formatIsoDate } from "@/domain/time/manila";
import { agentMayWork, monthOf, recordUsage } from "@/server/agents/state";
import { systemPrompt } from "@/server/agents/instructions";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { MondayDigestEmail, type DigestEmailProps } from "@/server/mail/templates/monday-digest";
import { deliver, type OutgoingMail } from "@/server/mail/transport";
import { reportError } from "@/server/monitoring/report-error";
import { payingAccounts } from "@/server/platform/today";
import { monthlyRecurringRevenue } from "@/domain/platform/today";
import type { PlanName } from "@/domain/plans/plans";

/**
 * The Monday 7 AM digest for Platform Owners: last week's numbers against the week before,
 * approvals waiting, incidents, what each agent did and what it cost, with links into the
 * console. Built from Propfolio's own data; the Digest agent only writes a three-sentence
 * summary on top (skipped when it is off). Sent once per week.
 */

export interface DigestDeps {
  send: (mail: OutgoingMail, fromName?: string) => Promise<void>;
  summarise?: (numbers: DigestNumbers, attention: string[]) => Promise<string | null>;
}

async function numbers(now: Date): Promise<DigestNumbers> {
  const p = manilaPeriods(now);
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  return asSystem(async () => {
    const [
      signUps,
      paying,
      trials,
      cancels,
      openTickets,
      newTickets,
      approvals,
      openIncidents,
      incidents,
    ] = await Promise.all([
      db.account.count({ where: { createdAt: { gte: p.lastWeekStart, lt: p.weekStart } } }),
      payingAccounts(now),
      db.account.count({ where: { status: "ACTIVE", trialEndsAt: { gt: now, lte: in7 } } }),
      db.auditLog.findMany({
        where: {
          action: { in: ["subscription.cancel_scheduled", "account.closed"] },
          at: { gte: p.monthStart },
          accountId: { not: null },
        },
        distinct: ["accountId"],
        select: { accountId: true },
      }),
      db.ticket.count({ where: { status: { not: "RESOLVED" } } }),
      db.ticket.count({ where: { createdAt: { gte: p.lastWeekStart, lt: p.weekStart } } }),
      db.approval.count({ where: { status: "PENDING" } }),
      db.incident.count({ where: { status: "OPEN" } }),
      db.incident.count({ where: { startedAt: { gte: p.lastWeekStart, lt: p.weekStart } } }),
    ]);
    const plans = [...paying.values()] as PlanName[];
    return {
      signUpsLastWeek: signUps,
      payingTotal: plans.length,
      mrr: monthlyRecurringRevenue(plans).toFixed(2),
      trialsEndingIn7Days: trials,
      cancellationsThisMonth: cancels.length,
      openTickets,
      ticketsOpenedLastWeek: newTickets,
      approvalsWaiting: approvals,
      openIncidents,
      incidentsLastWeek: incidents,
    };
  });
}

/** What each agent did last week, in plain lines, and its spend this month. */
async function agentLines(now: Date) {
  const p = manilaPeriods(now);
  return asSystem(async () => {
    const [calls, approvals, usage] = await Promise.all([
      db.agentActionLog.groupBy({
        by: ["agentKey", "ok"],
        where: { createdAt: { gte: p.lastWeekStart, lt: p.weekStart } },
        _count: { _all: true },
      }),
      db.approval.groupBy({
        by: ["agentKey", "actionType", "status"],
        where: { createdAt: { gte: p.lastWeekStart, lt: p.weekStart } },
        _count: { _all: true },
      }),
      db.agentUsage.findMany({ where: { month: monthOf(now) } }),
    ]);
    return AGENT_KEYS.map((key) => {
      const lines: string[] = [];
      for (const a of approvals.filter((x) => x.agentKey === key)) {
        const what = ACTION_TYPE_LABELS[a.actionType as ActionType] ?? a.actionType;
        const status =
          a.status === "TOLD"
            ? "done (told)"
            : a.status === "PENDING"
              ? "waiting"
              : a.status.toLowerCase();
        lines.push(`${a._count._all} × ${what}: ${status}`);
      }
      const refused = calls.find((c) => c.agentKey === key && !c.ok)?._count._all ?? 0;
      const ok = calls.find((c) => c.agentKey === key && c.ok)?._count._all ?? 0;
      if (ok || refused)
        lines.push(`${ok} tool call${ok === 1 ? "" : "s"}${refused ? `, ${refused} refused` : ""}`);
      const spent = usage.find((u) => u.agentKey === key)?.costUsd.toString() ?? "0";
      return {
        name: AGENTS[key].name,
        lines,
        spent: formatUsd(spent),
        cap: formatUsd(AGENTS[key].monthlyCapUsd),
      };
    });
  });
}

/** The Digest agent's three sentences (Haiku), or null when it is off or fails. */
export async function digestSummary(
  n: DigestNumbers,
  attention: string[],
  now = new Date(),
): Promise<string | null> {
  const key = env().ANTHROPIC_API_KEY_DIGEST;
  if (!key || !(await agentMayWork("DIGEST", now)).ok) return null;
  try {
    const client = new Anthropic({ apiKey: key });
    const r = await client.messages.create({
      model: AGENTS.DIGEST.model,
      max_tokens: 400,
      system: systemPrompt("DIGEST"),
      messages: [
        {
          role: "user",
          content: `Last week's numbers (JSON): ${JSON.stringify(n)}\nNeeds attention: ${JSON.stringify(attention)}\nWrite the three-sentence summary.`,
        },
      ],
    });
    await recordUsage(
      "DIGEST",
      { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens },
      now,
    );
    const text = r.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return text ? text.slice(0, 600) : null;
  } catch (err) {
    reportError(err, "digest-summary");
    return null;
  }
}

export async function buildDigest(
  now: Date,
  deps: Pick<DigestDeps, "summarise"> = {},
): Promise<DigestEmailProps & { weekOf: IsoDate; numbers: DigestNumbers }> {
  const weekOf = manilaPeriods(now).weekStartDay;
  const previous = await asSystem(() =>
    db.digestSnapshot.findUnique({ where: { weekOf: toDbDate(addDays(weekOf, -7)) } }),
  );
  const n = await numbers(now);
  const attention = attentionItems(n);
  const summary = await (deps.summarise ?? ((a, b) => digestSummary(a, b, now)))(n, attention);
  const from = addDays(weekOf, -7);
  return {
    weekOf,
    numbers: n,
    weekLabel: `${formatIsoDate(from)} to ${formatIsoDate(addDays(weekOf, -1))}`,
    summary,
    attention,
    rows: digestRows(n, (previous?.metrics as Partial<DigestNumbers> | undefined) ?? undefined),
    agents: await agentLines(now),
    consoleUrl: `${env().APP_URL}/platform`,
  };
}

/** The plain-text version, laid out line by line (email apps that don't show HTML). */
export function digestText(d: DigestEmailProps): string {
  return [
    `Monday digest · ${d.weekLabel}`,
    d.summary ?? "",
    "NEEDS YOU THIS WEEK",
    ...(d.attention.length ? d.attention.map((a) => `- ${a}`) : ["Nothing urgent."]),
    "",
    "THE NUMBERS",
    ...d.rows.map((r) => `${r.label}: ${r.now}${r.change ? ` (${r.change})` : ""}`),
    "",
    "WHAT THE AGENTS DID LAST WEEK",
    ...d.agents.flatMap((a) => [
      `${a.name} (${a.spent} of ${a.cap} this month)`,
      ...(a.lines.length ? a.lines.map((l) => `- ${l}`) : ["- Nothing."]),
    ]),
    "",
    `Console: ${d.consoleUrl}`,
    `Approvals: ${d.consoleUrl}/approvals`,
    `Tickets: ${d.consoleUrl}/tickets`,
    `System health: ${d.consoleUrl}/health`,
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");
}

/** Mondays, 7 AM Manila: send to every active Platform Owner, once per week. */
export async function sendMondayDigest(
  now = new Date(),
  deps: DigestDeps = { send: deliver },
): Promise<"sent" | "already_sent" | "no_owners"> {
  const weekOf = manilaPeriods(now).weekStartDay;
  const existing = await asSystem(() =>
    db.digestSnapshot.findUnique({ where: { weekOf: toDbDate(weekOf) } }),
  );
  if (existing?.sentAt) return "already_sent";
  const owners = await asSystem(() =>
    db.platformAdmin.findMany({
      where: { role: "PLATFORM_OWNER", isActive: true, totpConfirmedAt: { not: null } },
      select: { email: true },
    }),
  );
  if (owners.length === 0) return "no_owners";
  const d = await buildDigest(now, deps);
  const element = <MondayDigestEmail {...d} />;
  const html = await render(element);
  const text = digestText(d);
  await deps.send(
    { to: owners.map((o) => o.email), subject: `Monday digest: ${d.weekLabel}`, html, text },
    "Propfolio console",
  );
  await asSystem(() =>
    db.digestSnapshot.upsert({
      where: { weekOf: toDbDate(weekOf) },
      create: {
        weekOf: toDbDate(weekOf),
        metrics: d.numbers as unknown as Prisma.InputJsonValue,
        sentAt: now,
      },
      update: { metrics: d.numbers as unknown as Prisma.InputJsonValue, sentAt: now },
    }),
  );
  return "sent";
}
