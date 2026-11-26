/**
 * Create (or update) the agents on Claude Managed Agents from their instruction files and
 * tools, and the environment they run in. Run after a reviewed change to agents/ is merged:
 *
 *   pnpm agent:setup support      (or growth)
 *
 * Prints the ids to put in the server's settings (MANAGED_AGENT_ID_…,
 * MANAGED_AGENTS_ENVIRONMENT_ID). The agents get only their custom tools: no shell, files or web.
 */
import Anthropic from "@anthropic-ai/sdk";

import { AGENTS, type AgentKey } from "../src/config/agents";
import { AGENT_FOLDERS, systemPrompt, toolDefinitions } from "../src/server/agents/instructions";

async function main() {
  const arg = (process.argv[2] ?? "").toLowerCase();
  const key = (Object.entries(AGENT_FOLDERS).find(([, f]) => f === arg)?.[0] ??
    null) as AgentKey | null;
  if (!key || AGENTS[key].runsOn !== "managed-agents") {
    console.error("Usage: pnpm agent:setup support|growth");
    process.exitCode = 1;
    return;
  }
  const apiKey = process.env[AGENTS[key].anthropicKeyEnv];
  if (!apiKey) {
    console.error(`Set ${AGENTS[key].anthropicKeyEnv} first.`);
    process.exitCode = 1;
    return;
  }
  const client = new Anthropic({ apiKey });

  let environmentId = process.env.MANAGED_AGENTS_ENVIRONMENT_ID;
  if (!environmentId) {
    const environment = await client.beta.environments.create({
      name: "propfolio-agents",
      config: {
        type: "cloud",
        // No outside network at all: the agents only use Propfolio's tools.
        networking: { type: "limited", allow_package_managers: false, allow_mcp_servers: false },
      },
    });
    environmentId = environment.id;
  }

  const definition = {
    name: `Propfolio ${AGENTS[key].name}`,
    model: AGENTS[key].model,
    system: systemPrompt(key),
    tools: toolDefinitions(key),
  };
  const existing = process.env[`MANAGED_AGENT_ID_${key}`];
  const agent = existing
    ? await client.beta.agents.update(existing, definition)
    : await client.beta.agents.create(definition);

  console.log("\nPut these in /opt/propfolio/deploy/.env (then docker compose up -d):\n");
  console.log(`MANAGED_AGENTS_ENVIRONMENT_ID=${environmentId}`);
  console.log(`MANAGED_AGENT_ID_${key}=${agent.id}`);
  console.log(`\n(${AGENTS[key].name}, version ${agent.version}, model ${AGENTS[key].model})\n`);
}

main().catch((err: unknown) => {
  console.error("Set-up failed:", err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exitCode = 1;
});
