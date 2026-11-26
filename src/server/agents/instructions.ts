import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { AGENTS, type AgentKey } from "@/config/agents";
import { actionByName } from "./actions";
import { actionInputSchema } from "./gateway";

/**
 * Each agent's instructions live in files (agents/<name>/role.md, rules.md, playbooks/*.md),
 * changed only through reviewed pull requests. This builds the system prompt and tool list.
 */

export const AGENT_FOLDERS: Record<AgentKey, string> = {
  SUPPORT: "support",
  GROWTH: "growth",
  DIGEST: "digest",
  ENGINEERING: "engineering",
};

function root(): string {
  return process.env.AGENTS_DIR ?? join(process.cwd(), "agents");
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

/** The shared rules every agent follows, then its role, rules and playbooks. */
export function systemPrompt(key: AgentKey): string {
  const dir = join(root(), AGENT_FOLDERS[key]);
  const playbooksDir = join(dir, "playbooks");
  const playbooks = existsSync(playbooksDir)
    ? readdirSync(playbooksDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) => read(join(playbooksDir, f)))
    : [];
  return [
    read(join(root(), "shared-rules.md")),
    read(join(dir, "role.md")),
    read(join(dir, "rules.md")),
    ...playbooks,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/** The agent's tools: exactly its allowed gateway actions. */
export function toolDefinitions(key: AgentKey) {
  return AGENTS[key].actions.map((name) => {
    const action = actionByName(name);
    if (!action) throw new Error(`Unknown action ${name} for ${key}`);
    return {
      type: "custom" as const,
      name,
      description: action.description,
      input_schema: actionInputSchema(name) as { type: "object"; [k: string]: unknown },
    };
  });
}
