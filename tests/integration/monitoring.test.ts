process.env.MONITORING_WEBHOOK_TOKEN = "monitoring-token-for-tests-123456";

import { beforeEach, describe, expect, it } from "vitest";

import type { PushMessage, PushSender } from "@/server/alerts/pushover";
import { asSystem, db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  applySignal,
  countOpenIncidents,
  listIncidents,
  recordHeartbeat,
  resolveIncident,
  retryAlerts,
  sendTestAlert,
  workerStatus,
} from "@/server/monitoring/incidents";
import { handleMonitoringWebhook, monitoringTokenOk } from "@/server/monitoring/webhook";
import { getTodayMetrics } from "@/server/platform/today";
import { makeStaff, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const TOKEN = "monitoring-token-for-tests-123456";
const NOW = new Date("2026-11-26T02:00:00Z");

function recorder(ok = true) {
  const sent: PushMessage[] = [];
  const send: PushSender = async (m) => {
    sent.push(m);
    return ok ? { sent: 1, failed: 0 } : { sent: 0, failed: 1 };
  };
  return { sent, send };
}

const down = (status: string, id = "bs-1") =>
  JSON.stringify({
    data: {
      id,
      attributes: { name: "propfolioph.com", url: "https://propfolioph.com/api/health", status },
    },
  });

describe("monitoring webhooks", () => {
  it("refuse a missing or wrong token", async () => {
    expect(monitoringTokenOk(null)).toBe(false);
    expect(monitoringTokenOk("wrong")).toBe(false);
    expect((await handleMonitoringWebhook("better-stack", "nope", down("Started"))).status).toBe(
      401,
    );
    expect(await countOpenIncidents()).toBe(0);
  });

  it("unknown tools and bad JSON are refused", async () => {
    expect((await handleMonitoringWebhook("pagerduty", TOKEN, "{}")).status).toBe(404);
    expect((await handleMonitoringWebhook("sentry", TOKEN, "not json")).status).toBe(400);
  });

  it("Better Stack opens an urgent incident once and resolves it", async () => {
    const r1 = await handleMonitoringWebhook("better-stack", TOKEN, down("Started"), NOW);
    const r2 = await handleMonitoringWebhook("better-stack", TOKEN, down("Started"), NOW);
    expect(r1.incidentId).toBe(r2.incidentId);
    expect(await countOpenIncidents()).toBe(1);
    await handleMonitoringWebhook("better-stack", TOKEN, down("Resolved"), NOW);
    expect(await countOpenIncidents()).toBe(0);
    const row = await asSystem(() => db.incident.findFirstOrThrow());
    expect(row).toMatchObject({ source: "UPTIME", severity: "URGENT", status: "RESOLVED" });
  });
});

describe("alerts", () => {
  it("urgent incidents push an emergency alert; resolving sends an all-clear", async () => {
    const { sent, send } = recorder();
    const signal = {
      action: "open" as const,
      externalId: "x1",
      title: "propfolioph.com is down",
      link: null,
      severity: "URGENT" as const,
      startedAt: null,
      details: {},
    };
    const id = await applySignal("UPTIME", signal, NOW, send);
    expect(sent[0]).toMatchObject({ priority: 2, title: "Propfolio: urgent" });
    expect(sent[0]!.url).toMatch(/\/platform\/health$/);
    const row = await asSystem(() => db.incident.findUniqueOrThrow({ where: { id: id! } }));
    expect(row.alertedAt).toEqual(NOW);
    await applySignal("UPTIME", { ...signal, action: "resolve" }, NOW, send);
    expect(sent[1]).toMatchObject({ priority: 0, title: "Resolved" });
  });

  it("error alerts are normal priority and never carry personal data", async () => {
    const { sent, send } = recorder();
    await applySignal(
      "ERROR_TRACKER",
      {
        action: "open",
        externalId: "s1",
        title: "TypeError in worker:subscriptions",
        link: null,
        severity: "NORMAL",
        startedAt: null,
        details: { level: "error" },
      },
      NOW,
      send,
    );
    expect(sent[0]).toMatchObject({ priority: 0, title: "Propfolio: needs a look" });
  });

  it("alerts that didn't go out are retried by the worker, up to a limit", async () => {
    const failing = recorder(false);
    await applySignal(
      "UPTIME",
      {
        action: "open",
        externalId: "r1",
        title: "Site is down",
        link: null,
        severity: "URGENT",
        startedAt: null,
        details: {},
      },
      NOW,
      failing.send,
    );
    expect(await retryAlerts(NOW, failing.send)).toBe(1);
    const ok = recorder();
    expect(await retryAlerts(NOW, ok.send)).toBe(1);
    expect(await retryAlerts(NOW, ok.send)).toBe(0);
  });
});

describe("System health (console)", () => {
  it("lists incidents for every role; only Support and Owner resolve them", async () => {
    const { send } = recorder();
    const id = (await applySignal(
      "UPTIME",
      {
        action: "open",
        externalId: "h1",
        title: "Site is down",
        link: null,
        severity: "URGENT",
        startedAt: null,
        details: {},
      },
      NOW,
      send,
    ))!;
    const ro = await makeStaff("PLATFORM_READONLY");
    const support = await makeStaff("PLATFORM_SUPPORT");
    expect(await listIncidents(ro, NOW)).toHaveLength(1);
    expect((await getTodayMetrics(ro, NOW)).openIncidents).toBe(1);
    await expect(resolveIncident(ro, id, "done", meta, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveIncident(support, id, " ", meta, NOW)).rejects.toThrow(/what was done/);
    await resolveIncident(support, id, "Restarted the web app", meta, NOW);
    await expect(resolveIncident(support, id, "again", meta, NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const log = await asSystem(() =>
      db.staffLog.findFirstOrThrow({ where: { action: "incident.resolved" } }),
    );
    expect(log).toMatchObject({ adminId: support.id, entityId: id });
  });

  it("a test alert is logged; read-only staff can't send one", async () => {
    const { sent, send } = recorder();
    const owner = await makeStaff("PLATFORM_OWNER", "Olga");
    await expect(
      sendTestAlert(await makeStaff("PLATFORM_READONLY"), meta, send),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await sendTestAlert(owner, meta, send)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]!.message).toMatch(/Olga/);
  });

  it("the worker is shown stopped after 15 minutes without a heartbeat", async () => {
    expect((await workerStatus(NOW)).ok).toBe(false);
    await recordHeartbeat("worker", NOW);
    expect((await workerStatus(new Date(NOW.getTime() + 10 * 60_000))).ok).toBe(true);
    expect((await workerStatus(new Date(NOW.getTime() + 16 * 60_000))).ok).toBe(false);
  });
});
