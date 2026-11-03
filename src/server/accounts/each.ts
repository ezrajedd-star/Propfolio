import { asSystem, db, runInAccount } from "@/server/db";
import { reportError } from "@/server/monitoring/report-error";

export interface EachResult<T> {
  accountId: string;
  result?: T;
  error?: string;
}

/**
 * Run a job for every active (not suspended) account, one at a time, each inside its own
 * account. One account's failure doesn't stop the others; it is logged (error type only) and
 * reported in the results. Throws at the end if any failed, so the job runner retries — jobs
 * passed here must be safe to run twice.
 */
export async function forEachActiveAccount<T>(
  job: (accountId: string) => Promise<T>,
): Promise<EachResult<T>[]> {
  const accounts = await asSystem(() =>
    db.account.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  );
  const results: EachResult<T>[] = [];
  for (const { id } of accounts) {
    try {
      results.push({ accountId: id, result: await runInAccount(id, () => job(id)) });
    } catch (err) {
      const type = err instanceof Error ? err.name : typeof err;
      reportError(err, `account-job:${id}`);
      results.push({ accountId: id, error: type });
    }
  }
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    throw new Error(`Job failed for ${failed.length} of ${results.length} account(s)`);
  }
  return results;
}
