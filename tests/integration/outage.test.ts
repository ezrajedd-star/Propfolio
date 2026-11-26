process.env.MONITORING_WEBHOOK_TOKEN = "monitoring-token-for-tests-123456";
process.env.GITHUB_ISSUES_TOKEN = "test-token";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushSender } from "@/server/alerts/pushover";
import { approve } from "@/server/agents/approvals";
import { asSystem, db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { logOutbox } from "@/server/mail/transport";
import { applySignal, recordHeartbeat, resolveIncident } from "@/server/monitoring/incidents";
import { handleOpsCall } from "@/server/monitoring/ops-api";
import {
  listOpsRequests,
  publicNotices,
  requestRestart,
  watchRestoreChecks,
} from "@/server/monitoring/outage";
import { makeStaff, meta, resetDb } from "./helpers";

// GitHub is never called for real: issues are recorded here.
const issues: { url: string; body: { title: string; body: string; labels: string[] } }[] = [];
beforeEach(async () => {
  await resetDb();
  issues.length = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    issues.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json({ number: 42, html_url: "https://github.com/x/y/issues/42" });
  });
});
afterEach(() => vi.restoreAllMocks());

const TOKEN = "monitoring-token-for-tests-123456";
const NOW = new Date("2026-11-28T02:00:00Z");
const quiet: PushSender = async () => ({ sent: 1, failed: 0 });

const siteDown = {
  action: "open" as const,
  externalId: "bs-1",
  title: "propfolioph.com is down",
  link: null,
  severity: "URGENT" as const,
  startedAt: NOW,
  details: {},
};

describe("an urgent incident", () => {
  it("records diagnostics and drafts a status-page message for approval", async () => {
    await recordHeartbeat("worker", NOW);
    const id = await applySignal("UPTIME", siteDown, NOW, quiet);
    const i = await asSystem(() => db.incident.findUniqueOrThrow({ where: { id: id! } }));
    expect(i.diagnostics).toMatchObject({ database: true, step: "RESTART_WEB" });
    const a = await asSystem(() => db.approval.findFirstOrThrow());
    expect(a).toMatchObject({
      agentKey: "ENGINEERING",
      actionType: "STATUS_UPDATE",
      status: "PENDING",
    });
    // Nothing public until a person approves.
    expect(await publicNotices(NOW)).toEqual([]);

    await approve(
      await makeStaff("PLATFORM_OWNER"),
      a.id,
      { editedText: "Propfolio is slow to load. We're on it. Your data is safe." },
      meta,
      NOW,
    );
    const notes = await publicNotices(NOW);
    expect(notes).toEqual([
      expect.objectContaining({
        text: "Propfolio is slow to load. We're on it. Your data is safe.",
        resolved: false,
      }),
    ]);
  });

  it("when resolved: the waiting draft is withdrawn, or a 'fixed' draft follows a published one", async () => {
    const id1 = await applySignal("UPTIME", siteDown, NOW, quiet);
    await applySignal("UPTIME", { ...siteDown, action: "resolve" }, NOW, quiet);
    const first = await asSystem(() => db.approval.findFirstOrThrow({ where: { entityId: id1! } }));
    expect(first.status).toBe("REJECTED");

    const id2 = await applySignal("UPTIME", { ...siteDown, externalId: "bs-2" }, NOW, quiet);
    const draft = await asSystem(() =>
      db.approval.findFirstOrThrow({ where: { entityId: id2!, status: "PENDING" } }),
    );
    const owner = await makeStaff("PLATFORM_OWNER");
    await approve(owner, draft.id, {}, meta, NOW);
    await resolveIncident(owner, id2!, "Restarted the web app", meta, NOW);
    const fixed = await asSystem(() =>
      db.approval.findFirstOrThrow({ where: { entityId: id2!, status: "PENDING" } }),
    );
    expect((fixed.payload as { phase: string }).phase).toBe("resolved");
    // The approved message stays up for a day after resolving, then goes.
    expect(await publicNotices(NOW)).toHaveLength(1);
    expect(await publicNotices(new Date(NOW.getTime() + 25 * 3_600_000))).toHaveLength(0);
  });

  it("a normal error drafts nothing public", async () => {
    await applySignal(
      "ERROR_TRACKER",
      { ...siteDown, externalId: "s-1", title: "TypeError in /leases", severity: "NORMAL" },
      NOW,
      quiet,
    );
    expect(await asSystem(() => db.approval.count())).toBe(0);
  });
});

describe("error alerts become GitHub issues for the Engineering agent", () => {
  it("opens one issue labelled alert, with personal details masked", async () => {
    {
      const id = await applySignal(
        "ERROR_TRACKER",
        {
          ...siteDown,
          externalId: "s-2",
          title: "Error for juana.example@example.com in /tenants",
          severity: "NORMAL",
        },
        NOW,
        quiet,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]!.url).toMatch(/\/issues$/);
      expect(issues[0]!.body.labels).toEqual(["alert"]);
      expect(JSON.stringify(issues[0]!.body)).not.toMatch(/juana\.example@example\.com/);
      const i = await asSystem(() => db.incident.findUniqueOrThrow({ where: { id: id! } }));
      expect(i.githubIssueNumber).toBe(42);
    }
  });
});

describe("runbook-safe restarts", () => {
  it("only staff who manage health can ask; the watchdog picks it up and reports back", async () => {
    const ro = await makeStaff("PLATFORM_READONLY");
    await expect(requestRestart(ro, "RESTART_WEB", "down", meta, NOW)).rejects.toThrow(
      ForbiddenError,
    );
    const owner = await makeStaff("PLATFORM_OWNER");
    const r = await requestRestart(owner, "RESTART_WEB", "Site not loading", meta, NOW);
    await expect(requestRestart(owner, "RESTART_WEB", "again", meta, NOW)).rejects.toThrow(
      /already waiting/,
    );
    expect(
      await asSystem(() => db.staffLog.count({ where: { action: "ops.restart_requested" } })),
    ).toBe(1);

    expect((await handleOpsCall("GET", "requests", "wrong", "")).status).toBe(401);
    const list = await handleOpsCall("GET", "requests", TOKEN, "");
    expect(list.body).toEqual({ requests: [{ id: r.id, kind: "RESTART_WEB" }] });
    const done = await handleOpsCall(
      "POST",
      "result",
      TOKEN,
      JSON.stringify({ id: r.id, ok: true, result: "web restarted" }),
      NOW,
    );
    expect(done.status).toBe(200);
    expect((await handleOpsCall("GET", "requests", TOKEN, "")).body).toEqual({ requests: [] });
    // The watchdog's own restarts are listed too.
    await handleOpsCall(
      "POST",
      "result",
      TOKEN,
      JSON.stringify({ kind: "RESTART_WORKER", ok: true, result: "worker restarted" }),
      NOW,
    );
    const shown = await listOpsRequests(ro);
    expect(shown.map((x) => [x.kind, x.status, x.requestedByName])).toEqual(
      expect.arrayContaining([
        ["RESTART_WEB", "DONE", owner.name],
        ["RESTART_WORKER", "DONE", null],
      ]),
    );
  });

  it("refuses unknown calls and bad bodies", async () => {
    expect((await handleOpsCall("POST", "deploy", TOKEN, "{}")).status).toBe(404);
    expect((await handleOpsCall("POST", "result", TOKEN, "nope")).status).toBe(400);
    expect(
      (await handleOpsCall("POST", "result", TOKEN, JSON.stringify({ ok: "yes" }))).status,
    ).toBe(400);
  });
});

describe("monthly backup-restore check", () => {
  const body = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      backupFile: "db-20261101-1830.dump",
      backupTakenAt: "2026-11-01T18:30:00.000Z",
      tableCounts: { Account: 3, User: 12, _prisma_migrations: 60, Lease: 40 },
      durationSeconds: 14,
      problem: null,
      ...over,
    });

  it("a passing check is saved and reported to owners by email", async () => {
    await makeStaff("PLATFORM_OWNER");
    logOutbox.length = 0;
    const r = await handleOpsCall("POST", "restore-check", TOKEN, body(), NOW);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(logOutbox.at(-1)?.subject).toBe("Backup restore check passed");
    expect(await asSystem(() => db.incident.count())).toBe(0);
  });

  it("a failed check opens an incident and says FAILED", async () => {
    await makeStaff("PLATFORM_OWNER");
    logOutbox.length = 0;
    const r = await handleOpsCall(
      "POST",
      "restore-check",
      TOKEN,
      body({ tableCounts: { Account: 0, User: 0 } }),
      NOW,
    );
    expect(r.body).toEqual({ ok: false });
    expect(logOutbox.at(-1)?.subject).toMatch(/FAILED/);
    expect(await asSystem(() => db.incident.count({ where: { status: "OPEN" } }))).toBe(1);
  });

  it("an overdue check opens an incident; a new server isn't overdue", async () => {
    expect(await watchRestoreChecks(NOW)).toBe(false);
    expect(await watchRestoreChecks(new Date(NOW.getTime() + 36 * 86_400_000))).toBe(true);
    expect(await asSystem(() => db.incident.count({ where: { source: "HEALTH_CHECK" } }))).toBe(1);
    await handleOpsCall(
      "POST",
      "restore-check",
      TOKEN,
      body(),
      new Date(NOW.getTime() + 37 * 86_400_000),
    );
    expect(await watchRestoreChecks(new Date(NOW.getTime() + 38 * 86_400_000))).toBe(false);
  });
});
