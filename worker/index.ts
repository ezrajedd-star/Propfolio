/**
 * Background worker. Runs scheduled jobs with pg-boss (state is kept in Postgres, so no
 * extra infrastructure is needed). Jobs are idempotent and log what they did.
 *
 * Jobs (times are Asia/Manila):
 * - 00:05 lease-status-sync: recompute every lease's stored status for the new day.
 * - 03:15 housekeeping: remove old sessions and abandoned lease drafts.
 * Later phases add the 06:00 reminder digest and overdue calculations.
 */
import PgBoss from "pg-boss";

import { BUSINESS_TIME_ZONE } from "../src/domain/time/manila";
import { purgeOldSessions } from "../src/server/auth/session";
import { db } from "../src/server/db";
import { purgeOldDrafts } from "../src/server/leases/drafts";
import { syncLeaseStatuses } from "../src/server/leases/service";

type Job = { name: string; cron: string; run: () => Promise<string> };

const JOBS: Job[] = [
  {
    name: "lease-status-sync",
    cron: "5 0 * * *",
    run: async () => `updated ${await syncLeaseStatuses()} lease status(es)`,
  },
  {
    name: "housekeeping",
    cron: "15 3 * * *",
    run: async () =>
      `removed ${await purgeOldSessions()} old session(s), ${await purgeOldDrafts()} old draft(s)`,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err.message));
  await boss.start();

  for (const job of JOBS) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron, {}, { tz: BUSINESS_TIME_ZONE });
    await boss.work(job.name, async () => {
      const started = Date.now();
      const summary = await job.run();
      console.info(`[worker] ${job.name}: ${summary} (${Date.now() - started} ms)`);
    });
  }
  // Statuses must be right even if the worker was down at midnight.
  console.info(`[worker] startup lease-status-sync: ${await JOBS[0]!.run()}`);

  console.info("[worker] started");

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} received, stopping`);
    await boss.stop({ graceful: true, timeout: 20_000 });
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
