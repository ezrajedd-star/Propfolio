import type { WebsiteStatKind } from "@prisma/client";

import { toDbDate } from "@/domain/time/calendar-date";
import { manilaToday } from "@/domain/time/manila";
import { addDays } from "@/domain/time/calendar-date";
import { asSystem, db } from "@/server/db";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan } from "@/server/platform/staff-log";

/** Add one to today's count (Manila day). Statistics never stop a page or a sign-up. */
export async function countWebsiteStat(
  kind: WebsiteStatKind,
  path: string,
  source: string,
  now = new Date(),
): Promise<void> {
  const day = toDbDate(manilaToday(now));
  try {
    await asSystem(
      () => db.$executeRaw`
        INSERT INTO "WebsiteStat" ("day", "kind", "path", "source", "count")
        VALUES (${day}, ${kind}::"WebsiteStatKind", ${path}, ${source}, 1)
        ON CONFLICT ("day", "kind", "path", "source") DO UPDATE SET "count" = "WebsiteStat"."count" + 1`,
    );
  } catch (err) {
    console.error("[website-stats] not counted:", (err as Error).name);
  }
}

export interface WebsiteReport {
  from: string;
  to: string;
  visits: number;
  signups: number;
  pages: { path: string; visits: number; signups: number }[];
  sources: { source: string; visits: number; signups: number }[];
  daily: { day: string; visits: number; signups: number }[];
}

/** The last `days` days, for the platform admin. */
export async function websiteReport(
  admin: PlatformActor,
  days = 30,
  now = new Date(),
): Promise<WebsiteReport> {
  assertPlatformCan(admin, "console.view");
  const to = manilaToday(now);
  const from = addDays(to, -(days - 1));
  const rows = await asSystem(() =>
    db.websiteStat.findMany({ where: { day: { gte: toDbDate(from), lte: toDbDate(to) } } }),
  );
  const pages = new Map<string, { visits: number; signups: number }>();
  const sources = new Map<string, { visits: number; signups: number }>();
  const daily = new Map<string, { visits: number; signups: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, { visits: 0, signups: 0 });
  let visits = 0;
  let signups = 0;
  for (const r of rows) {
    const key = r.kind === "VISIT" ? "visits" : "signups";
    const d = r.day.toISOString().slice(0, 10);
    for (const [map, k] of [
      [pages, r.path],
      [sources, r.source],
      [daily, d],
    ] as const) {
      const v = map.get(k) ?? { visits: 0, signups: 0 };
      v[key] += r.count;
      map.set(k, v);
    }
    if (key === "visits") visits += r.count;
    else signups += r.count;
  }
  const sorted = (m: Map<string, { visits: number; signups: number }>) =>
    [...m.entries()].sort((a, b) => b[1].visits - a[1].visits || b[1].signups - a[1].signups);
  return {
    from,
    to,
    visits,
    signups,
    pages: sorted(pages).map(([path, v]) => ({ path, ...v })),
    sources: sorted(sources).map(([source, v]) => ({ source, ...v })),
    daily: [...daily.entries()].map(([day, v]) => ({ day, ...v })),
  };
}
