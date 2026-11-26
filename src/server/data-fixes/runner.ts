import { asSystem, db, type Tx } from "@/server/db";
import { writeStaffLog } from "@/server/platform/staff-log";

/**
 * Reviewed data fixes: one-off corrections to production data, written as a script, reviewed in
 * a pull request, tried with a dry run (on staging first), then applied after approval with a
 * backup taken first. Never a raw database editor. See scripts/data-fixes/README.md.
 */
export interface DataFix {
  /** What the fix changes, in plain words. */
  what: string;
  /** Why it is needed. */
  why: string;
  /** The support ticket or GitHub issue, e.g. "T-1042" or "#57". */
  ticket: string;
  /**
   * Make the change inside the transaction and return a short summary with counts only (no
   * names, emails or other personal data): it goes in the staff log.
   */
  run: (tx: Tx) => Promise<Record<string, number | string>>;
}

export class DryRunRollback extends Error {
  constructor(readonly summary: Record<string, number | string>) {
    super("dry run");
    this.name = "DryRunRollback";
  }
}

export function validateFix(fix: Partial<DataFix>): string[] {
  const problems: string[] = [];
  if (!fix.what?.trim()) problems.push("`what` is missing");
  if (!fix.why?.trim()) problems.push("`why` is missing");
  if (!fix.ticket?.trim()) problems.push("`ticket` is missing");
  if (typeof fix.run !== "function") problems.push("`run` is missing");
  return problems;
}

/**
 * Run a fix in one transaction. A dry run makes the changes, reports them, then rolls everything
 * back. Applying needs the name of the person who approved it. Both are written to the staff log.
 */
export async function runDataFix(
  file: string,
  fix: DataFix,
  opts: { apply: boolean; approvedBy?: string },
): Promise<{ applied: boolean; summary: Record<string, number | string> }> {
  const problems = validateFix(fix);
  if (problems.length) throw new Error(`This fix isn't ready: ${problems.join(", ")}.`);
  if (opts.apply && !opts.approvedBy?.trim()) {
    throw new Error('Applying a fix needs --approved-by "Name of the approver".');
  }
  return asSystem(async () => {
    let summary: Record<string, number | string>;
    try {
      summary = await db.$transaction(
        async (tx) => {
          const s = await fix.run(tx);
          if (!opts.apply) throw new DryRunRollback(s);
          await writeStaffLog(
            {
              actor: null,
              kind: "CHANGE",
              action: "data_fix.applied",
              entityType: "DataFix",
              entityId: file,
              metadata: {
                what: fix.what,
                why: fix.why,
                ticket: fix.ticket,
                approvedBy: opts.approvedBy,
                summary: s,
              },
            },
            tx,
          );
          return s;
        },
        { timeout: 120_000 },
      );
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
      await writeStaffLog({
        actor: null,
        kind: "VIEW",
        action: "data_fix.dry_run",
        entityType: "DataFix",
        entityId: file,
        metadata: { what: fix.what, ticket: fix.ticket, summary: err.summary },
      });
      return { applied: false, summary: err.summary };
    }
    return { applied: true, summary };
  });
}
