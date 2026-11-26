import Anthropic from "@anthropic-ai/sdk";
import Decimal from "decimal.js";

import { AGENTS, AGENT_SESSION_RETENTION_DAYS, type AgentKey } from "@/config/agents";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { reportError } from "@/server/monitoring/report-error";
import { callAgentAction } from "./gateway";
import { agentMayWork, monthSpend, recordUsage } from "./state";

/**
 * Runs an agent on Claude Managed Agents. The agent has no tools of its own (no shell, no web):
 * only custom tools, which are answered here through the agent API gateway. Each run has a
 * spending budget (what is left of the month's cap, at most $2), and the session's history is
 * deleted after 30 days.
 */

/** At most this much per run, whatever is left of the monthly cap. */
const RUN_BUDGET_CENTS = 200;
/** A run that hasn't finished by then is stopped. */
const RUN_TIMEOUT_MS = 10 * 60_000;
const MAX_TOOL_CALLS = 40;

export interface RunRequest {
  agentKey: AgentKey;
  /** e.g. "ticket" or "daily-list": shown on the Agents page. */
  purpose: string;
  entityId?: string;
  /** The task, with any customer text inside <untrusted> tags. */
  message: string;
}

export type RunResult =
  | { ran: false; reason: string }
  | { ran: true; sessionId: string; toolCalls: number; costUsd: string };

type Client = Pick<Anthropic, "beta">;

export function agentClient(key: AgentKey): Client | null {
  const apiKey = (env() as unknown as Record<string, string | undefined>)[
    AGENTS[key].anthropicKeyEnv
  ];
  return apiKey ? new Anthropic({ apiKey }) : null;
}

function managedAgentId(key: AgentKey): string | undefined {
  return (env() as unknown as Record<string, string | undefined>)[`MANAGED_AGENT_ID_${key}`];
}

export async function runManagedAgent(
  req: RunRequest,
  now = new Date(),
  client: Client | null = agentClient(req.agentKey),
): Promise<RunResult> {
  const may = await agentMayWork(req.agentKey, now);
  if (!may.ok) return { ran: false, reason: may.reason };
  const agentId = managedAgentId(req.agentKey);
  const environmentId = env().MANAGED_AGENTS_ENVIRONMENT_ID;
  if (!client || !agentId || !environmentId) {
    return {
      ran: false,
      reason: "The agent isn't set up on Claude yet (see docs/ops-console/agents-setup.md).",
    };
  }
  const left = new Decimal(AGENTS[req.agentKey].monthlyCapUsd).minus(
    await monthSpend(req.agentKey, now),
  );
  const budgetCents = Math.max(1, Math.min(RUN_BUDGET_CENTS, left.times(100).floor().toNumber()));

  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
    title: `${req.purpose}${req.entityId ? ` ${req.entityId.slice(0, 8)}` : ""}`,
    budget: { type: "limit", max_list_cost: { amount: String(budgetCents), currency: "USD" } },
    metadata: { purpose: req.purpose.slice(0, 60) },
  });
  const row = await asSystem(() =>
    db.agentSession.create({
      data: {
        agentKey: req.agentKey,
        externalId: session.id,
        purpose: req.purpose,
        entityId: req.entityId ?? null,
        createdAt: now,
      },
    }),
  );

  let toolCalls = 0;
  let status = "finished";
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  try {
    const stream = await client.beta.sessions.events.stream(session.id);
    await client.beta.sessions.events.send(session.id, {
      events: [{ type: "user.message", content: [{ type: "text", text: req.message }] }],
    });
    for await (const event of stream) {
      if (Date.now() > deadline) {
        status = "timed out";
        break;
      }
      if (event.type === "agent.custom_tool_use") {
        toolCalls += 1;
        const r =
          toolCalls > MAX_TOOL_CALLS
            ? {
                ok: false as const,
                error: "refused" as const,
                message: "Too many steps: stop and hand over.",
              }
            : await callAgentAction(req.agentKey, event.name, event.input, new Date());
        await client.beta.sessions.events.send(session.id, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: event.id,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(r.ok ? r.data : { error: r.error, message: r.message }),
                },
              ],
              ...(r.ok ? {} : { is_error: true }),
            },
          ],
        });
      } else if (event.type === "session.status_idle") {
        if (event.stop_reason.type !== "requires_action") break;
      } else if (event.type === "session.status_terminated") {
        status = "terminated";
        break;
      }
    }
  } catch (err) {
    status = "failed";
    reportError(err, `agent-run:${req.agentKey}`);
  }

  // What it used: the session's own list cost when available, else tokens and time.
  let cost = new Decimal(0);
  try {
    const done = await client.beta.sessions.retrieve(session.id);
    const u = done.usage;
    const listCents = u.list_cost?.amount;
    const usage = {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens:
        (u.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
        (u.cache_creation?.ephemeral_1h_input_tokens ?? 0),
      sessionHours: (u.active_seconds ?? 0) / 3600,
    };
    cost = await recordUsage(req.agentKey, usage, new Date());
    if (listCents) cost = new Decimal(listCents).dividedBy(100);
    if (status === "finished")
      await client.beta.sessions.archive(session.id).catch(() => undefined);
  } catch (err) {
    reportError(err, `agent-usage:${req.agentKey}`);
  }
  await asSystem(() =>
    db.agentSession.update({
      where: { id: row.id },
      data: { status, endedAt: new Date(), costUsd: cost.toFixed(4) },
    }),
  );
  return { ran: true, sessionId: session.id, toolCalls, costUsd: cost.toFixed(4) };
}

/** Daily: delete Managed Agents session history older than 30 days. */
export async function deleteOldAgentSessions(
  now = new Date(),
  clients: (key: AgentKey) => Client | null = agentClient,
): Promise<number> {
  const before = new Date(now.getTime() - AGENT_SESSION_RETENTION_DAYS * 86_400_000);
  const old = await asSystem(() =>
    db.agentSession.findMany({
      where: { createdAt: { lt: before }, deletedAt: null, externalId: { not: null } },
      take: 500,
    }),
  );
  let deleted = 0;
  for (const s of old) {
    const client = clients(s.agentKey as AgentKey);
    if (!client) continue;
    try {
      await client.beta.sessions.delete(s.externalId!);
    } catch (err) {
      // Already gone is fine; anything else is retried tomorrow.
      if (!(err instanceof Anthropic.NotFoundError)) {
        reportError(err, "agent-session-delete");
        continue;
      }
    }
    await asSystem(() => db.agentSession.update({ where: { id: s.id }, data: { deletedAt: now } }));
    deleted += 1;
  }
  return deleted;
}
