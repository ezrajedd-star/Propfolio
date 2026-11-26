import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { AGENTS, AGENT_KEYS, type AgentKey } from "@/config/agents";
import { asSystem, db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { hitRateLimit } from "@/server/rate-limit";
import { actionByName } from "./actions";
import { agentMayWork } from "./state";

/**
 * The agent API: the only way an AI agent reaches Propfolio. Each call is checked (the agent
 * is on and under its cap, the action is on its allowed list, within its hourly limit, the input
 * is valid) and logged. Agents never get database access or tenant records.
 */

export type GatewayResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      error: "refused" | "invalid" | "not_found" | "rate_limited" | "failed";
      message: string;
    };

export async function callAgentAction(
  agentKey: AgentKey,
  actionName: string,
  rawInput: unknown,
  now = new Date(),
): Promise<GatewayResult> {
  const started = Date.now();
  const log = (ok: boolean, error: string | null, summary = "") =>
    asSystem(() =>
      db.agentActionLog.create({
        data: {
          agentKey,
          action: actionName.slice(0, 60),
          ok,
          error,
          summary: summary.slice(0, 200),
          durationMs: Date.now() - started,
          createdAt: now,
        },
      }),
    ).catch(() => undefined);

  const may = await agentMayWork(agentKey, now);
  if (!may.ok) {
    await log(false, may.reason);
    return { ok: false, error: "refused", message: may.reason };
  }
  const action = actionByName(actionName);
  if (!action || !AGENTS[agentKey].actions.includes(actionName)) {
    await log(false, "Action not allowed for this agent");
    return {
      ok: false,
      error: "refused",
      message: `${actionName} isn't one of this agent's actions.`,
    };
  }
  const limit = await hitRateLimit("agentCallsByAgent", agentKey, now);
  if (!limit.allowed) {
    await log(false, "Rate limited");
    return {
      ok: false,
      error: "rate_limited",
      message: "Too many calls this hour. Wait and try again later.",
    };
  }
  const parsed = action.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    await log(false, "Invalid input");
    return {
      ok: false,
      error: "invalid",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; "),
    };
  }
  try {
    const data = await action.run(parsed.data, { agentKey, now });
    await log(true, null, action.summary?.(parsed.data) ?? "");
    return { ok: true, data };
  } catch (err) {
    const notFound = err instanceof AppError && err.status === 404;
    await log(false, err instanceof Error ? err.name : "Error");
    return {
      ok: false,
      error: notFound ? "not_found" : "failed",
      message:
        err instanceof AppError
          ? err.message
          : "It didn't work. Try a different approach or hand over.",
    };
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Which agent a gateway key belongs to (each agent has its own key in the environment). */
export function agentForKey(key: string | null | undefined): AgentKey | null {
  if (!key || key.length < 32 || key.length > 200) return null;
  const given = sha(key);
  const e = env() as unknown as Record<string, string | undefined>;
  for (const agent of AGENT_KEYS) {
    const expected = e[AGENTS[agent].keyEnv];
    if (expected && timingSafeEqual(given, sha(expected))) return agent;
  }
  return null;
}

/** JSON Schema for one action's input (for the agent's tool definitions). */
export function actionInputSchema(name: string): Record<string, unknown> {
  const a = actionByName(name);
  if (!a) throw new Error(`Unknown action ${name}`);
  const schema = z.toJSONSchema(a.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
