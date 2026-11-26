/**
 * Outage handling rules. Pure: no I/O. What the diagnostics mean, which runbook-safe step to
 * suggest, the plain status-page wording, and the monthly restore check verdict.
 */

export interface Diagnostics {
  database: boolean;
  worker: { ok: boolean; minutesSinceLastSeen: number | null };
  /** Incidents opened in the last hour (all sources), this one included. */
  incidentsLastHour: number;
  checkedAt: string;
}

export type SafeStep = "RESTART_WEB" | "RESTART_WORKER" | "WAIT" | "ESCALATE";

export interface Diagnosis {
  findings: string[];
  step: SafeStep;
  stepText: string;
}

/** Plain findings, and the one runbook-safe step to try (docs/runbooks/outage.md). */
export function diagnose(
  d: Diagnostics,
  source: "UPTIME" | "ERROR_TRACKER" | "HEALTH_CHECK" | "MANUAL",
): Diagnosis {
  const findings: string[] = [
    d.database ? "The database answers." : "The database is not answering.",
    d.worker.ok
      ? "Background jobs are running."
      : d.worker.minutesSinceLastSeen === null
        ? "Background jobs have never checked in."
        : `Background jobs last checked in ${d.worker.minutesSinceLastSeen} minutes ago.`,
  ];
  if (d.incidentsLastHour > 3)
    findings.push(`${d.incidentsLastHour} incidents in the last hour: something bigger is wrong.`);

  if (!d.database) {
    return {
      findings,
      step: "ESCALATE",
      stepText:
        "Don't restart anything yet. Follow step 3 of the outage runbook (database not answering).",
    };
  }
  if (d.incidentsLastHour > 3) {
    return {
      findings,
      step: "ESCALATE",
      stepText: "Several things failed at once. Follow step 4 of the outage runbook.",
    };
  }
  if (!d.worker.ok && source !== "UPTIME") {
    return { findings, step: "RESTART_WORKER", stepText: "Restart background jobs." };
  }
  if (source === "UPTIME") {
    return {
      findings,
      step: "RESTART_WEB",
      stepText:
        "Restart the web app. If it's still down 5 minutes later, roll back the last release.",
    };
  }
  return {
    findings,
    step: "WAIT",
    stepText:
      "Nothing to restart. The Engineering agent looks at the error and opens a pull request if it finds the cause.",
  };
}

/** The status-page draft. Plain, calm, and never internal details. */
export function statusDraft(
  source: "UPTIME" | "ERROR_TRACKER" | "HEALTH_CHECK" | "MANUAL",
  phase: "investigating" | "resolved",
): string {
  if (phase === "resolved") {
    return "Fixed: Propfolio is working normally again. Sorry for the trouble. Your data was safe throughout.";
  }
  if (source === "HEALTH_CHECK") {
    return "Reminder emails may be late right now. We're working on it. Your data is safe, and the app works as normal.";
  }
  if (source === "ERROR_TRACKER") {
    return "Some people may see an error in Propfolio right now. We're working on a fix. Your data is safe.";
  }
  return "Propfolio isn't loading for some people right now. We're working on it. Your data is safe.";
}

/** Shown on /status: while the incident is open, and for a while after it is resolved. */
export function publicNoteVisible(
  i: { publicNote: string | null; status: "OPEN" | "RESOLVED"; resolvedAt: Date | null },
  now: Date,
  hoursAfter: number,
): boolean {
  if (!i.publicNote) return false;
  if (i.status === "OPEN") return true;
  return i.resolvedAt !== null && now.getTime() - i.resolvedAt.getTime() <= hoursAfter * 3_600_000;
}

/** A restore check passes only if every must-have table came back with rows. */
export function restoreVerdict(
  counts: Record<string, number>,
  mustHaveRows: readonly string[],
  scriptProblem: string | null,
): { ok: boolean; problem: string | null } {
  if (scriptProblem) return { ok: false, problem: scriptProblem.slice(0, 300) };
  const empty = mustHaveRows.filter((t) => !(counts[t] && counts[t] > 0));
  if (empty.length > 0) {
    return { ok: false, problem: `These tables came back empty: ${empty.join(", ")}.` };
  }
  return { ok: true, problem: null };
}

export function restoreOverdue(lastCheckedAt: Date | null, now: Date, overdueDays: number) {
  return (
    lastCheckedAt === null || now.getTime() - lastCheckedAt.getTime() > overdueDays * 86_400_000
  );
}

/** The monthly report email body (plain text). */
export function restoreReport(r: {
  ok: boolean;
  backupFile: string;
  backupTakenAt: Date | null;
  tableCounts: Record<string, number>;
  durationSeconds: number;
  problem: string | null;
  formatDate: (d: Date) => string;
}): { subject: string; body: string } {
  const tables = Object.keys(r.tableCounts).length;
  const rows = Object.values(r.tableCounts).reduce((a, b) => a + b, 0);
  const pick = ["Account", "User", "Lease", "Payment", "Document"]
    .filter((t) => t in r.tableCounts)
    .map((t) => `${t}: ${r.tableCounts[t]!.toLocaleString("en-US")}`)
    .join(", ");
  const when = r.backupTakenAt ? ` taken ${r.formatDate(r.backupTakenAt)}` : "";
  if (!r.ok) {
    return {
      subject: "Backup restore check FAILED",
      body: `The monthly backup restore check failed.\n\nBackup: ${r.backupFile}${when}.\nProblem: ${r.problem ?? "unknown"}\n\nWhat to do: follow docs/restore.md step 1 to check the backups by hand, or ask a developer today. Your live data is not affected.`,
    };
  }
  return {
    subject: "Backup restore check passed",
    body: `This month's backup restore check passed.\n\nBackup: ${r.backupFile}${when}.\nRestored ${tables} tables, ${rows.toLocaleString("en-US")} rows in ${r.durationSeconds} seconds.${pick ? `\n${pick}.` : ""}\n\nNothing to do. The restored copy was deleted afterwards.`,
  };
}
