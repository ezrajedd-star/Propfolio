/**
 * Copy this file to scripts/data-fixes/<yyyy-mm-dd>-<ticket>-<short-name>.ts and fill it in.
 * Keep it small: change only what the ticket needs. Return counts only (no names or emails).
 */
import type { DataFix } from "../../src/server/data-fixes/runner";

const fix: DataFix = {
  what: "Describe the change in plain words, e.g. 'Set the end date of lease LSE-2026-0042'.",
  why: "Why it can't be done in the app, e.g. 'Imported with the wrong year; the lease is posted'.",
  ticket: "T-0000",
  async run(tx) {
    // Example: always narrow by account id and record id, never by name.
    // const { count } = await tx.unit.updateMany({
    //   where: { accountId: "…", id: "…" },
    //   data: { … },
    // });
    void tx;
    return { changed: 0 };
  },
};

export default fix;
