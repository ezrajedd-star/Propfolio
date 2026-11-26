/**
 * Background worker. Runs scheduled jobs with pg-boss (state is kept in Postgres, so no
 * extra infrastructure is needed). Jobs are idempotent and log what they did.
 *
 * Jobs (times are Asia/Manila):
 * - 00:05 lease-status-sync: recompute every lease's stored status for the new day.
 * - 03:15 housekeeping: remove old sessions, abandoned lease drafts, finished two-step sign-in
 *   steps, expired remembered devices and old rate-limit counters.
 * - 06:00 daily-reminders: each account's one reminder email of the day to its Leasing team. If sending
 *   fails it is retried 3 times (10, 20, 40 minutes later); failures are shown to Admins in
 *   Settings → Reminder emails, and missed reminders go out with the next day's email.
 *
 * - 07:00 subscriptions: ask for monthly renewals that are due, end cancelled subscriptions after
 *   their paid month and unpaid ones after the 7-day grace period (the account moves to Free),
 *   and remind past-due Owners on grace days 3 and 6.
 * - 09:00 trial-reminders: "your free Premium trial ends soon" to each account's Owner and
 *   Admins, 7 days and 1 day before. Retried 3 times; each email is sent once per trial end.
 *
 * - every 10 minutes failed-sign-in-alert: emails the platform admins about a burst of failed
 *   sign-ins (counts only), at most once an hour.
 *
 * Lease statuses and reminders run once per active account, inside that account (so its data
 * is all they can see). Suspended accounts are skipped. A retry only redoes accounts that still
 * need it: both jobs are idempotent.
 */
import { PgBoss } from "pg-boss";

import { BUSINESS_TIME_ZONE } from "../src/domain/time/manila";
import { forEachActiveAccount } from "../src/server/accounts/each";
import { purgeOldSessions } from "../src/server/auth/session";
import { purgeOldTwoStepRows } from "../src/server/auth/two-step";
import { reportError } from "../src/server/monitoring/report-error";
import { checkFailedSignIns } from "../src/server/monitoring/sign-in-alert";
import { purgeOldRateLimits } from "../src/server/rate-limit";
import { db } from "../src/server/db";
import { prepareBossSchema } from "../src/server/jobs/boss-schema";
import { purgeOldDrafts } from "../src/server/leases/drafts";
import { syncLeaseStatuses } from "../src/server/leases/service";
import { sendTrialReminders } from "../src/server/plans/trial-reminders";
import { runClosedAccounts } from "../src/server/accounts/closing";
import { purgeOldDemoRequests } from "../src/server/demo/service";
import { purgeOldWebsiteLeads } from "../src/server/website-leads/service";
import { purgeExpiredSignUps } from "../src/server/signup/service";
import { runSubscriptionCycle } from "../src/server/subscription/service";
import { sendDailyDigest } from "../src/server/reminders/digest-job";
import { MONITORING } from "../src/config/ops";
import { recordHeartbeat, retryAlerts } from "../src/server/monitoring/incidents";
import { PIPELINE } from "../src/config/ops";
import { runPipelineHousekeeping } from "../src/server/pipeline/service";
import { AGENT_HOUSEKEEPING_CRON, APPROVALS, DIGEST_CRON } from "../src/config/agents";
import { sendMondayDigest } from "../src/server/digest/service";
import { GROWTH_SCHEDULE } from "../src/config/ops";
import { runGrowthDaily, runGrowthWeekly } from "../src/server/agents/growth";
import { remindWaitingApprovals } from "../src/server/agents/approvals";
import { deleteOldAgentSessions } from "../src/server/agents/runner";
import { bugFollowUps, runQueuedSupportTickets } from "../src/server/agents/support";

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
    const results = await forEachActiveAccount(() => sendDailyDigest());
    const count = (s: string) => results.filter((r) => r.result?.status === s).length;
    return (
      `${results.length} account(s): ${count("SENT")} sent, ${count("EMPTY")} with nothing to send, ` +
      `${count("ALREADY_DONE")} already done, ${count("IN_PROGRESS")} in progress`
    );
  },
};

const JOBS: Job[] = [
  {
    name: "lease-status-sync",
    cron: "5 0 * * *",
    run: async () => {
      const results = await forEachActiveAccount(() => syncLeaseStatuses());
      const updated = results.reduce((n, r) => n + (r.result ?? 0), 0);
      return `updated ${updated} lease status(es) in ${results.length} account(s)`;
    },
  },
  {
    name: "housekeeping",
    cron: "15 3 * * *",
    run: async () =>
      `removed ${await purgeOldSessions()} old session(s), ${await purgeOldDrafts()} old draft(s), ` +
      `${await purgeOldTwoStepRows()} old sign-in step(s) and device(s), ${await purgeOldRateLimits()} old rate-limit counter(s), ` +
      `${await purgeExpiredSignUps()} expired sign-up(s), ${await purgeOldDemoRequests()} old demo request(s), ${await purgeOldWebsiteLeads()} old website request(s)`,
  },
  dailyReminders,
  {
    name: "subscriptions",
    cron: "0 7 * * *",
    retry: { retryLimit: 3, retryDelay: 600, retryBackoff: true },
    run: async () => {
      const r = await runSubscriptionCycle();
      return `${r.renewalsRequested} renewal(s) requested, ${r.ended} subscription(s) ended, ${r.graceReminders} grace reminder(s)`;
    },
  },
  {
    name: "closed-accounts",
    cron: "30 9 * * *",
    retry: { retryLimit: 3, retryDelay: 600, retryBackoff: true },
    run: async () => {
      const r = await runClosedAccounts();
      return `${r.reminded} deletion reminder(s), ${r.deleted} closed account(s) deleted`;
    },
  },
  {
    name: "trial-reminders",
    cron: "0 9 * * *",
    retry: { retryLimit: 3, retryDelay: 600, retryBackoff: true },
    run: async () => {
      const r = await sendTrialReminders();
      return `${r.sent} trial reminder(s) sent`;
    },
  },
  {
    // Proves the worker is alive (System health, and the deep health check Better Stack watches).
    name: "heartbeat",
    cron: MONITORING.heartbeatCron,
    run: async () => {
      await recordHeartbeat("worker");
      const retried = await retryAlerts();
      return retried ? `heartbeat; ${retried} alert(s) retried` : "heartbeat";
    },
  },
  {
    // Lost leads past 24 months are deleted; Brevo marketing list kept in step with consent.
    name: "pipeline-housekeeping",
    cron: PIPELINE.dailyCron,
    run: async () => {
      const r = await runPipelineHousekeeping();
      return `${r.deleted} old lost lead(s) deleted, ${r.unsubscribed} unsubscribe(s), ${r.synced} synced`;
    },
  },
  {
    // Platform Owners hear about approvals waiting longer than the configured hours.
    name: "approval-reminders",
    cron: APPROVALS.reminderCron,
    run: async () => `${await remindWaitingApprovals()} approval(s) waiting too long`,
  },
  {
    // Managed Agents session history is deleted after 30 days.
    name: "agent-housekeeping",
    cron: AGENT_HOUSEKEEPING_CRON,
    run: async () => `${await deleteOldAgentSessions()} old agent session(s) deleted`,
  },
  {
    // The Support agent answers queued tickets (new ones and customer replies).
    name: "support-agent",
    cron: "* * * * *",
    run: async () => `${await runQueuedSupportTickets()} ticket(s) handled by the Support agent`,
  },
  {
    // Customers whose reported bug is fixed get a "the fix is out" reply (for approval).
    name: "bug-follow-ups",
    cron: "20 10 * * *",
    run: async () => `${await bugFollowUps()} fix-is-out reply/replies drafted`,
  },
  {
    // Mondays 7 AM Manila: last week's numbers, approvals, incidents, agents and costs.
    name: "monday-digest",
    cron: DIGEST_CRON,
    retry: { retryLimit: 3, retryDelay: 600, retryBackoff: true },
    run: async () => `Monday digest: ${await sendMondayDigest()}`,
  },
  {
    // Weekdays: pipeline upkeep, the "talk to today" list and follow-up drafts.
    name: "growth-daily",
    cron: GROWTH_SCHEDULE.dailyCron,
    run: async () => {
      const r = await runGrowthDaily();
      return r.ran
        ? `Growth agent ran (${r.toolCalls} tool calls)`
        : `Growth agent skipped: ${r.reason}`;
    },
  },
  {
    // Mondays: content calendar with draft posts, and the weekly report.
    name: "growth-weekly",
    cron: GROWTH_SCHEDULE.weeklyCron,
    run: async () => {
      const r = await runGrowthWeekly();
      return r.ran
        ? `Growth agent weekly run (${r.toolCalls} tool calls)`
        : `Growth weekly skipped: ${r.reason}`;
    },
  },
  {
    name: "failed-sign-in-alert",
    cron: "*/10 * * * *",
    run: async () => {
      const r = await checkFailedSignIns();
      return `${r.failed} failed sign-in(s) in 15 minutes${r.alerted ? "; platform admins alerted" : ""}`;
    },
  },
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

  const schema = await prepareBossSchema("pgboss");
  if (schema === "reset") {
    console.info(
      "[worker] job queue tables from pg-boss 10 replaced (schedules are set again below)",
    );
  }
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err: Error) => console.error("[worker] pg-boss error:", err.message));
  await boss.start();

  for (const job of JOBS) {
    await boss.createQueue(job.name, job.retry);
    if (job.retry) await boss.updateQueue(job.name, job.retry);
    await boss.schedule(job.name, job.cron, {}, { tz: BUSINESS_TIME_ZONE, ...(job.retry ?? {}) });
    await boss.work(job.name, async () => {
      const started = Date.now();
      try {
        const summary = await job.run();
        console.info(`[worker] ${job.name}: ${summary} (${Date.now() - started} ms)`);
      } catch (err) {
        // The error type only (no personal data); pg-boss retries the job.
        reportError(err, `worker:${job.name}`);
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

  await recordHeartbeat("worker");
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
