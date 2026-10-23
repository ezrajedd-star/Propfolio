/**
 * Background worker. Runs scheduled jobs with pg-boss (state is kept in Postgres, so no
 * extra infrastructure is needed). Jobs are idempotent and log what they did.
 *
 * Phase 1: session clean-up. Later phases add the 06:00 Asia/Manila daily job
 * (status sync, reminder digest, overdue calculations).
 */
import PgBoss from "pg-boss";

import { BUSINESS_TIME_ZONE } from "../src/domain/time/manila";
import { purgeOldSessions } from "../src/server/auth/session";
import { db } from "../src/server/db";

const JOBS = {
  sessionCleanup: { name: "session-cleanup", cron: "15 3 * * *" }, // 03:15 Manila daily
} as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err.message));
  await boss.start();

  await boss.createQueue(JOBS.sessionCleanup.name);
  await boss.schedule(
    JOBS.sessionCleanup.name,
    JOBS.sessionCleanup.cron,
    {},
    { tz: BUSINESS_TIME_ZONE },
  );
  await boss.work(JOBS.sessionCleanup.name, async () => {
    const removed = await purgeOldSessions();
    console.info(`[worker] session-cleanup removed ${removed} old session(s)`);
  });

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
