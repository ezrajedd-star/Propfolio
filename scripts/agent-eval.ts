/**
 * Run an agent's evaluations and print a score.
 *
 *   pnpm agent:eval support        (or growth)
 *
 * Uses the agent's pinned model and its own Anthropic key (ANTHROPIC_API_KEY_SUPPORT …), its
 * instruction files and its tools. Tools answer from each case's made-up `toolResults`; nothing
 * touches the database. Exits with an error when the score is under 90%.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { AGENTS, type AgentKey } from "../src/config/agents";
import { checkEval, evalScore, type EvalCase, type ToolCall } from "../src/domain/agents/evals";
import { AGENT_FOLDERS, systemPrompt, toolDefinitions } from "../src/server/agents/instructions";

const PASS_SCORE = 0.9;
const MAX_TURNS = 8;

async function runCase(client: Anthropic, key: AgentKey, c: EvalCase) {
  const tools = toolDefinitions(key).map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: c.message }];
  const calls: ToolCall[] = [];
  let finalText = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const r = await client.messages.create({
      model: AGENTS[key].model,
      max_tokens: 4096,
      system: systemPrompt(key),
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: r.content });
    const uses = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    finalText = r.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (uses.length === 0 || r.stop_reason !== "tool_use") break;
    messages.push({
      role: "user",
      content: uses.map((u) => {
        calls.push({ name: u.name, input: u.input as Record<string, unknown> });
        const result = c.toolResults?.[u.name] ?? { status: "done" };
        return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(result) };
      }),
    });
  }
  return { name: c.name, problems: checkEval(c, { calls, finalText }) };
}

async function main() {
  const arg = (process.argv[2] ?? "").toLowerCase();
  const key = (Object.entries(AGENT_FOLDERS).find(([, f]) => f === arg)?.[0] ??
    null) as AgentKey | null;
  if (!key) {
    console.error("Usage: pnpm agent:eval support|growth");
    process.exitCode = 1;
    return;
  }
  const apiKey = process.env[AGENTS[key].anthropicKeyEnv];
  if (!apiKey) {
    console.error(
      `Set ${AGENTS[key].anthropicKeyEnv} to run the evaluations (never paste it in a chat).`,
    );
    process.exitCode = 1;
    return;
  }
  const dir = join(process.cwd(), "agents", AGENT_FOLDERS[key], "evals");
  const cases = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase[]);
  const client = new Anthropic({ apiKey });
  console.log(`\n${AGENTS[key].name} on ${AGENTS[key].model}: ${cases.length} cases\n`);
  const results = [];
  for (const c of cases) {
    const r = await runCase(client, key, c);
    results.push(r);
    console.log(
      `${r.problems.length ? "✗" : "✓"} ${r.name}${r.problems.length ? `\n    ${r.problems.join("\n    ")}` : ""}`,
    );
  }
  const score = evalScore(results);
  console.log(`\nScore: ${Math.round(score * 100)}% (pass mark ${PASS_SCORE * 100}%)\n`);
  if (score < PASS_SCORE) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("Evaluation failed:", err instanceof Error ? err.name : err);
  process.exitCode = 1;
});
