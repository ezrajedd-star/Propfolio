import { rankLeads, type LeadFacts } from "@/domain/pipeline/signals";
import { fromDbDate, type IsoDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { asSystem, db } from "@/server/db";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan } from "@/server/platform/staff-log";

/**
 * The "talk to today" list: leads still in play, ranked by buying signals (weights in
 * src/config/ops.ts), each with its reasons. Used by the console and the Growth agent.
 */

const days = (from: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

export async function talkTodayList(now = new Date()) {
  const today = manilaToday(now) as IsoDate;
  return asSystem(async () => {
    const leads = await db.lead.findMany({
      where: { stage: { notIn: ["LOST", "PAYING"] } },
      take: 2000,
    });
    const accountIds = leads.map((l) => l.accountId).filter((id): id is string => !!id);
    const emails = leads.map((l) => l.email).filter((e): e is string => !!e);
    const [accounts, units, leases, sessions, demos] = await Promise.all([
      db.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, trialEndsAt: true },
      }),
      db.unit.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds }, archivedAt: null },
        _count: { _all: true },
      }),
      db.lease.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds }, archivedAt: null },
        _count: { _all: true },
      }),
      db.session.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds }, supportGrantId: null },
        _max: { lastSeenAt: true },
      }),
      db.demoRequest.groupBy({
        by: ["email"],
        where: { email: { in: emails } },
        _max: { createdAt: true },
      }),
    ]);
    const acc = new Map(accounts.map((a) => [a.id, a]));
    const count = (rows: { accountId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.accountId, r._count._all]));
    const unitCount = count(units);
    const leaseCount = count(leases);
    const lastSeen = new Map(sessions.map((s) => [s.accountId, s._max.lastSeenAt]));
    const demoAt = new Map(demos.map((d) => [d.email.toLowerCase(), d._max.createdAt]));

    const withFacts = leads.map((l) => {
      const a = l.accountId ? acc.get(l.accountId) : undefined;
      const seen = l.accountId ? lastSeen.get(l.accountId) : null;
      const demo = l.email ? demoAt.get(l.email) : null;
      const facts: LeadFacts = {
        stage: l.stage,
        source: l.source,
        portfolioSize: l.portfolioSize,
        nextFollowUp: l.nextFollowUp ? fromDbDate(l.nextFollowUp) : null,
        daysSinceActivity: days(l.lastActivityAt, now),
        demoRequestedDaysAgo: demo ? days(demo, now) : null,
        account: a
          ? {
              trialDaysLeft:
                a.trialEndsAt && a.trialEndsAt > now
                  ? Math.floor((a.trialEndsAt.getTime() - now.getTime()) / 86_400_000)
                  : null,
              units: unitCount.get(a.id) ?? 0,
              leases: leaseCount.get(a.id) ?? 0,
              daysSinceActive: seen ? days(seen, now) : null,
            }
          : null,
      };
      return {
        leadId: l.id,
        name: l.name,
        company: l.company,
        stage: l.stage,
        marketingConsent: l.marketingConsent && !l.unsubscribedAt,
        hasEmail: Boolean(l.email),
        facts,
      };
    });
    return rankLeads(withFacts, today);
  });
}

export async function talkTodayForConsole(admin: PlatformActor, now = new Date()) {
  assertPlatformCan(admin, "pipeline.view");
  return talkTodayList(now);
}
