import Decimal from "decimal.js";

import { AGENTS, AGENT_KEYS, ACTION_TYPES, type ActionType, type AgentKey } from "@/config/agents";
import { AUTONOMY_LEVELS, type AutonomyLevel } from "@/domain/agents/autonomy";
import { overCap, usageCost, type Usage } from "@/domain/agents/cost";
import { sendPush } from "@/server/alerts/pushover";
import { asSystem, db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import type { PlatformActor } from "@/server/platform/auth";
import { assertPlatformCan, writeStaffLog } from "@/server/platform/staff-log";
import type { RequestMeta } from "@/server/request-meta";

/**
 * Whether each agent is on, its autonomy settings, and what it has spent this month. Agents
 * start switched off and at Draft; only a Platform Owner changes either.
 */

export function isAgentKey(v: unknown): v is AgentKey {
  return typeof v === "string" && (AGENT_KEYS as readonly string[]).includes(v);
}

export function monthOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export async function agentState(key: AgentKey) {
  const s = await asSystem(() => db.agentState.findUnique({ where: { agentKey: key } }));
  return {
    enabled: s?.enabled ?? false,
    firstEnabledAt: s?.firstEnabledAt ?? null,
    stoppedReason: s?.stoppedReason ?? null,
  };
}

export async function monthSpend(key: AgentKey, now = new Date()): Promise<Decimal> {
  const u = await asSystem(() =>
    db.agentUsage.findUnique({ where: { agentKey_month: { agentKey: key, month: monthOf(now) } } }),
  );
  return new Decimal(u?.costUsd.toString() ?? "0");
}

/** Whether the agent may work now: switched on and under its monthly cap. */
export async function agentMayWork(
  key: AgentKey,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = await agentState(key);
  if (!s.enabled) return { ok: false, reason: s.stoppedReason ?? "The agent is switched off." };
  if (overCap(await monthSpend(key, now), AGENTS[key].monthlyCapUsd)) {
    return { ok: false, reason: "The agent reached its monthly spending cap." };
  }
  return { ok: true };
}

/**
 * Add what a run used. When the month's spend reaches the cap the agent switches itself off
 * (shown on the Agents page) and the Owner gets a phone alert.
 */
export async function recordUsage(key: AgentKey, usage: Usage, now = new Date()): Promise<Decimal> {
  const cost = usageCost(AGENTS[key].model, usage);
  const month = monthOf(now);
  const row = await asSystem(() =>
    db.agentUsage.upsert({
      where: { agentKey_month: { agentKey: key, month } },
      create: {
        agentKey: key,
        month,
        inputTokens: BigInt(usage.inputTokens),
        outputTokens: BigInt(usage.outputTokens),
        cacheReadTokens: BigInt(usage.cacheReadTokens ?? 0),
        cacheWriteTokens: BigInt(usage.cacheWriteTokens ?? 0),
        sessionSeconds: Math.round((usage.sessionHours ?? 0) * 3600),
        costUsd: cost.toFixed(4),
      },
      update: {
        inputTokens: { increment: BigInt(usage.inputTokens) },
        outputTokens: { increment: BigInt(usage.outputTokens) },
        cacheReadTokens: { increment: BigInt(usage.cacheReadTokens ?? 0) },
        cacheWriteTokens: { increment: BigInt(usage.cacheWriteTokens ?? 0) },
        sessionSeconds: { increment: Math.round((usage.sessionHours ?? 0) * 3600) },
        costUsd: { increment: cost.toFixed(4) },
      },
    }),
  );
  if (overCap(row.costUsd.toString(), AGENTS[key].monthlyCapUsd)) {
    const stopped = await asSystem(() =>
      db.agentState.updateMany({
        where: { agentKey: key, enabled: true },
        data: { enabled: false, stoppedReason: "Monthly cap reached" },
      }),
    );
    if (stopped.count > 0) {
      await asSystem(() =>
        writeStaffLog({
          actor: null,
          kind: "SETTING",
          action: "agent.stopped_at_cap",
          entityType: "Agent",
          entityId: key,
          metadata: { capUsd: AGENTS[key].monthlyCapUsd },
        }),
      );
      await sendPush({
        title: "Propfolio: agent stopped",
        message: `${AGENTS[key].name} reached its monthly cap of $${AGENTS[key].monthlyCapUsd} and switched itself off.`,
        priority: 0,
      }).catch(() => undefined);
    }
  }
  return cost;
}

export async function autonomyFor(key: AgentKey, type: ActionType): Promise<AutonomyLevel> {
  const row = await asSystem(() =>
    db.agentAutonomy.findUnique({
      where: { agentKey_actionType: { agentKey: key, actionType: type } },
    }),
  );
  return row?.level ?? "DRAFT";
}

// ─── The Agents page ─────────────────────────────────────────────────────────────────────

export async function agentsOverview(admin: PlatformActor, now = new Date()) {
  assertPlatformCan(admin, "agents.view");
  return asSystem(async () => {
    const [states, usage, autonomy, logs] = await Promise.all([
      db.agentState.findMany(),
      db.agentUsage.findMany({ where: { month: monthOf(now) } }),
      db.agentAutonomy.findMany(),
      db.agentActionLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return AGENT_KEYS.map((key) => {
      const s = states.find((x) => x.agentKey === key);
      const u = usage.find((x) => x.agentKey === key);
      return {
        key,
        config: AGENTS[key],
        enabled: s?.enabled ?? false,
        stoppedReason: s?.stoppedReason ?? null,
        firstEnabledAt: s?.firstEnabledAt ?? null,
        spentUsd: u?.costUsd.toString() ?? "0",
        autonomy: Object.fromEntries(
          AGENTS[key].actionTypes.map((t) => [
            t,
            autonomy.find((a) => a.agentKey === key && a.actionType === t)?.level ?? "DRAFT",
          ]),
        ) as Partial<Record<ActionType, AutonomyLevel>>,
        activity: logs.filter((l) => l.agentKey === key).slice(0, 25),
      };
    });
  });
}

export async function setAgentEnabled(
  admin: PlatformActor,
  key: string,
  enabled: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  assertPlatformCan(admin, "agents.manage");
  if (!isAgentKey(key)) throw new ValidationError("Unknown agent.");
  if (enabled && overCap(await monthSpend(key, now), AGENTS[key].monthlyCapUsd)) {
    throw new ValidationError(
      "This agent has reached its monthly cap. Raise the cap in src/config/agents.ts (a reviewed change) or wait for next month.",
    );
  }
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const before = await tx.agentState.findUnique({ where: { agentKey: key } });
      await tx.agentState.upsert({
        where: { agentKey: key },
        create: {
          agentKey: key,
          enabled,
          firstEnabledAt: enabled ? now : null,
          updatedById: admin.id,
        },
        update: {
          enabled,
          stoppedReason: null,
          updatedById: admin.id,
          ...(enabled && !before?.firstEnabledAt ? { firstEnabledAt: now } : {}),
        },
      });
      await writeStaffLog(
        {
          actor: admin,
          kind: "SETTING",
          action: enabled ? "agent.switched_on" : "agent.switched_off",
          entityType: "Agent",
          entityId: key,
          meta,
        },
        tx,
      );
    }),
  );
}

export async function setAutonomy(
  admin: PlatformActor,
  key: string,
  type: string,
  level: string,
  meta: RequestMeta,
) {
  assertPlatformCan(admin, "agents.manage");
  if (!isAgentKey(key)) throw new ValidationError("Unknown agent.");
  if (
    !(ACTION_TYPES as readonly string[]).includes(type) ||
    !AGENTS[key].actionTypes.includes(type as ActionType)
  ) {
    throw new ValidationError("This agent doesn't do that.");
  }
  if (!(AUTONOMY_LEVELS as readonly string[]).includes(level)) {
    throw new ValidationError("Choose Draft, Act and tell, or Act.");
  }
  await asSystem(() =>
    db.$transaction(async (tx) => {
      const before = await tx.agentAutonomy.findUnique({
        where: { agentKey_actionType: { agentKey: key, actionType: type } },
      });
      await tx.agentAutonomy.upsert({
        where: { agentKey_actionType: { agentKey: key, actionType: type } },
        create: {
          agentKey: key,
          actionType: type,
          level: level as AutonomyLevel,
          updatedById: admin.id,
        },
        update: { level: level as AutonomyLevel, updatedById: admin.id },
      });
      await writeStaffLog(
        {
          actor: admin,
          kind: "SETTING",
          action: "agent.autonomy_changed",
          entityType: "Agent",
          entityId: key,
          metadata: { actionType: type, from: before?.level ?? "DRAFT", to: level },
          meta,
        },
        tx,
      );
    }),
  );
}
