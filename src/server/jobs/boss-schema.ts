import { asSystem, db } from "@/server/db";

/** The oldest job-queue schema pg-boss 12 can upgrade (pg-boss 11's). pg-boss 10 wrote 24. */
export const BOSS_MIN_UPGRADABLE_SCHEMA = 25;

/**
 * pg-boss 12 can't upgrade the tables pg-boss 10 made. They only hold the job schedule (which the
 * worker writes again on every start) and the history of past runs, so an old schema is removed
 * and pg-boss creates a new one. Returns what it did, for the log.
 */
export async function prepareBossSchema(schema = "pgboss"): Promise<"none" | "current" | "reset"> {
  return asSystem(async () => {
    const [table] = await db.$queryRaw<{ found: boolean }[]>`
      SELECT to_regclass(${`${schema}.version`}) IS NOT NULL AS found`;
    if (!table?.found) return "none";
    const [row] = await db.$queryRawUnsafe<{ version: number }[]>(
      `SELECT version FROM "${schema}"."version" LIMIT 1`,
    );
    if (row && Number(row.version) >= BOSS_MIN_UPGRADABLE_SCHEMA) return "current";
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    return "reset";
  });
}
