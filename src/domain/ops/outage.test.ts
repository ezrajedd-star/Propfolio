import { describe, expect, it } from "vitest";

import {
  diagnose,
  publicNoteVisible,
  restoreOverdue,
  restoreReport,
  restoreVerdict,
  statusDraft,
  type Diagnostics,
} from "./outage";

const healthy: Diagnostics = {
  database: true,
  worker: { ok: true, minutesSinceLastSeen: 2 },
  incidentsLastHour: 1,
  checkedAt: "2026-11-28T00:00:00.000Z",
};

describe("diagnose", () => {
  it.each([
    ["site down, all else fine", healthy, "UPTIME", "RESTART_WEB"],
    [
      "worker stopped",
      { ...healthy, worker: { ok: false, minutesSinceLastSeen: 40 } },
      "HEALTH_CHECK",
      "RESTART_WORKER",
    ],
    ["database down: never restart", { ...healthy, database: false }, "UPTIME", "ESCALATE"],
    ["many incidents at once", { ...healthy, incidentsLastHour: 5 }, "ERROR_TRACKER", "ESCALATE"],
    ["an error, all fine: wait for the agent", healthy, "ERROR_TRACKER", "WAIT"],
  ] as const)("%s", (_, d, source, step) => {
    expect(diagnose(d, source).step).toBe(step);
  });

  it("says plainly what it found", () => {
    const r = diagnose(
      { ...healthy, worker: { ok: false, minutesSinceLastSeen: null } },
      "HEALTH_CHECK",
    );
    expect(r.findings).toEqual(["The database answers.", "Background jobs have never checked in."]);
  });
});

describe("status-page drafts", () => {
  it.each([
    ["UPTIME", "investigating", /isn't loading/],
    ["ERROR_TRACKER", "investigating", /see an error/],
    ["HEALTH_CHECK", "investigating", /Reminder emails/],
    ["UPTIME", "resolved", /working normally again/],
  ] as const)("%s %s", (source, phase, re) => {
    const t = statusDraft(source, phase);
    expect(t).toMatch(re);
    expect(t).toMatch(/data (is|was) safe/);
  });
});

describe("public note on /status", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  it.each([
    ["no note", { publicNote: null, status: "OPEN", resolvedAt: null }, false],
    ["open", { publicNote: "x", status: "OPEN", resolvedAt: null }, true],
    [
      "resolved 2h ago",
      { publicNote: "x", status: "RESOLVED", resolvedAt: new Date("2026-11-28T10:00:00Z") },
      true,
    ],
    [
      "resolved 2 days ago",
      { publicNote: "x", status: "RESOLVED", resolvedAt: new Date("2026-11-26T10:00:00Z") },
      false,
    ],
  ] as const)("%s", (_, i, shown) => {
    expect(publicNoteVisible(i, now, 24)).toBe(shown);
  });
});

describe("restore check", () => {
  const must = ["Account", "User"];
  it.each([
    ["all there", { Account: 3, User: 5 }, null, true],
    ["empty table", { Account: 3, User: 0 }, null, false],
    ["missing table", { Account: 3 }, null, false],
    ["script failed", { Account: 3, User: 5 }, "pg_restore failed", false],
  ] as const)("%s", (_, counts, problem, ok) => {
    expect(restoreVerdict(counts, must, problem).ok).toBe(ok);
  });

  it.each([
    [null, true],
    [new Date("2026-11-01T00:00:00Z"), false],
    [new Date("2026-10-01T00:00:00Z"), true],
  ] as const)("overdue since %s: %s", (last, overdue) => {
    expect(restoreOverdue(last, new Date("2026-11-28T00:00:00Z"), 35)).toBe(overdue);
  });

  it("writes a plain report", () => {
    const fmt = () => "1 Nov 2026";
    const ok = restoreReport({
      ok: true,
      backupFile: "db-20261101-1830.dump",
      backupTakenAt: new Date("2026-11-01T18:30:00Z"),
      tableCounts: { Account: 3, User: 1200, Lease: 40 },
      durationSeconds: 12,
      problem: null,
      formatDate: fmt,
    });
    expect(ok.subject).toBe("Backup restore check passed");
    expect(ok.body).toMatch(/Restored 3 tables, 1,243 rows in 12 seconds/);
    expect(ok.body).toMatch(/User: 1,200/);
    const bad = restoreReport({
      ...{
        backupFile: "x",
        backupTakenAt: null,
        tableCounts: {},
        durationSeconds: 1,
        formatDate: fmt,
      },
      ok: false,
      problem: "empty",
    });
    expect(bad.subject).toMatch(/FAILED/);
    expect(bad.body).toMatch(/Problem: empty/);
  });
});
