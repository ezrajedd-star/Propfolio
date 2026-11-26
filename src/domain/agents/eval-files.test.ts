import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENTS, AGENT_KEYS } from "@/config/agents";
import type { EvalCase } from "./evals";

/**
 * The agents' evaluation files: well-formed, about real tools, and made-up data only (no real
 * email addresses or phone numbers).
 */
const root = join(process.cwd(), "agents");
const folders = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
const files = folders.flatMap((d) => {
  const dir = join(root, d.name, "evals");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ agent: d.name, path: join(dir, f) }))
    : [];
});

describe("agent instruction folders", () => {
  it.each(folders.map((d) => d.name))("%s has a role and rules", (name) => {
    expect(existsSync(join(root, name, "role.md"))).toBe(true);
    expect(existsSync(join(root, name, "rules.md"))).toBe(true);
  });
});

describe.each(files)("$agent: $path", ({ agent, path }) => {
  const cases = JSON.parse(readFileSync(path, "utf8")) as EvalCase[];
  const key = AGENT_KEYS.find((k) => k.toLowerCase() === agent);
  const tools = new Set(key ? AGENTS[key].actions : []);

  it("has cases with a name, a message and expectations", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.name).toBeTruthy();
      expect(c.message).toBeTruthy();
      expect(c.expect).toBeTruthy();
    }
  });

  it("only mentions the agent's own tools", () => {
    for (const c of cases) {
      const named = [
        ...(c.expect.calls ?? []),
        ...(c.expect.neverCalls ?? []),
        ...(c.expect.callWith ?? []).map((w) => w.tool),
        ...(c.expect.neverCallWith ?? []).map((w) => w.tool),
        ...Object.keys(c.toolResults ?? {}),
      ];
      for (const t of named) expect(tools.has(t), `${c.name}: ${t}`).toBe(true);
    }
  });

  it("uses made-up data only", () => {
    const text = readFileSync(path, "utf8");
    const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    for (const e of emails) expect(e).toMatch(/@(example\.(com|test|org)|[\w-]+\.test)$/);
    expect(text).not.toMatch(/(?:\+?63|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/);
  });
});
