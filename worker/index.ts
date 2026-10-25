/**
 * Background worker. Runs scheduled jobs with pg-boss (state is kept in Postgres, so no
 * extra infrastructure is needed). Jobs are idempotent and log what they did.
 *
 * Jobs (times are Asia/Manila):
 * - 00:05 lease-status-sync: recompute every lease's stored status for the new day.
 * - 03:15 housekeeping: remove old sessions and abandoned lease drafts.
 * - 06:00 daily-reminders: the one reminder email of the day to the Leasing team. If sending
 *   fails it is retried 3 times (10, 20, 40 minutes later); failures are shown to Admins in
 *   Settings → Reminder emails, and missed reminders go out with the next day's email.
 */
import PgBoss from "pg-boss";

import { BUSINESS_TIME_ZONE } from "../src/domain/time/manila";
import { purgeOldSessions } from "../src/server/auth/session";
import { db } from "../src/server/db";
import { purgeOldDrafts } from "../src/server/leases/drafts";
import { syncLeaseStatuses } from "../src/server/leases/service";
import { sendDailyDigest } from "../src/server/reminders/digest-job";

type Job = {
  name: string;
  cron: string;
  run: () => Promise<string>;
  retry?: { retryLimit: number; retryDelay: number; retryBackoff: boolean };
};

const dailyReminders: Job = {
  name: "daily-reminders",
  cron: "0 6 * * *",
  retry: { retryLimit: 3, retryDelay: 600, retryBackoff: true },
  run: async () => {
    const r = await sendDailyDigest();
    switch (r.status) {
      case "SENT":
        return `sent to ${r.recipientCount} people about ${r.leaseCount} lease(s)`;
      case "EMPTY":
        return "nothing needed attention today; no email sent";
      case "ALREADY_DONE":
        return "today's email was already handled";
      default:
        return "another run is sending right now";
    }
  },
};

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
  dailyReminders,
];

/** Current hour in Manila (0–23). */
function manilaHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: BUSINESS_TIME_ZONE,
    }).format(now),
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err.message));
  await boss.start();

  for (const job of JOBS) {
    await boss.createQueue(job.name, job.retry ? { name: job.name, ...job.retry } : undefined);
    if (job.retry) await boss.updateQueue(job.name, { name: job.name, ...job.retry });
    await boss.schedule(job.name, job.cron, {}, { tz: BUSINESS_TIME_ZONE, ...(job.retry ?? {}) });
    await boss.work(job.name, async () => {
      const started = Date.now();
      try {
        const summary = await job.run();
        console.info(`[worker] ${job.name}: ${summary} (${Date.now() - started} ms)`);
      } catch (err) {
        // Log the error type only (no personal data); pg-boss retries the job.
        console.error(
          `[worker] ${job.name} failed: ${err instanceof Error ? err.name : typeof err}`,
        );
        throw err;
      }
    });
  }

  // Catch up after downtime: statuses must be right, and if the worker starts after 06:00
  // and today's reminder email hasn't gone out, send it now (the job is idempotent).
  console.info(`[worker] startup lease-status-sync: ${await JOBS[0]!.run()}`);
  if (manilaHour() >= 6) {
    await dailyReminders.run().then(
      (summary) => console.info(`[worker] startup daily-reminders: ${summary}`),
      () =>
        console.error(
          "[worker] startup daily-reminders failed; the 06:00 job and Admins can retry",
        ),
    );
  }

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
