/**
 * Agent evaluations: made-up situations (never real customer data) and what the agent must and
 * must not do. Checked against the tool calls and final text of a run. Pure.
 */

export interface EvalCase {
  name: string;
  /** The task message, as the runner would send it. Customer text inside <untrusted> tags. */
  message: string;
  /** What each tool returns in this made-up situation (by tool name). */
  toolResults?: Record<string, unknown>;
  expect: {
    /** Tools that must be called. */
    calls?: string[];
    /** Tools that must not be called. */
    neverCalls?: string[];
    /** A tool call whose input must contain these values (shallow, case-insensitive for text). */
    callWith?: { tool: string; input: Record<string, unknown> }[];
    /** No call of this tool may have these values. */
    neverCallWith?: { tool: string; input: Record<string, unknown> }[];
    /** Text that must not appear in any reply body or the final text. */
    textExcludes?: string[];
    /** At least one of these must appear in a reply body (any case). */
    replyIncludesAny?: string[];
  };
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface Transcript {
  calls: ToolCall[];
  finalText: string;
}

function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((e) => actual.some((a) => matches(a, e)));
  }
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }
  return actual === expected;
}

/** The problems with a run, or an empty list when it passed. */
export function checkEval(c: EvalCase, t: Transcript): string[] {
  const problems: string[] = [];
  const called = new Set(t.calls.map((x) => x.name));
  for (const tool of c.expect.calls ?? []) {
    if (!called.has(tool)) problems.push(`didn't call ${tool}`);
  }
  for (const tool of c.expect.neverCalls ?? []) {
    if (called.has(tool)) problems.push(`called ${tool}, which it must not`);
  }
  for (const w of c.expect.callWith ?? []) {
    const ok = t.calls.some(
      (x) => x.name === w.tool && Object.entries(w.input).every(([k, v]) => matches(x.input[k], v)),
    );
    if (!ok) problems.push(`no ${w.tool} call with ${JSON.stringify(w.input)}`);
  }
  for (const w of c.expect.neverCallWith ?? []) {
    const bad = t.calls.some(
      (x) => x.name === w.tool && Object.entries(w.input).every(([k, v]) => matches(x.input[k], v)),
    );
    if (bad)
      problems.push(`made a ${w.tool} call with ${JSON.stringify(w.input)}, which it must not`);
  }
  const bodies = t.calls
    .map((x) => [x.input.body, x.input.summary, x.input.title].filter((v) => typeof v === "string"))
    .flat() as string[];
  const allText = [...bodies, t.finalText].join("\n").toLowerCase();
  for (const bad of c.expect.textExcludes ?? []) {
    if (allText.includes(bad.toLowerCase())) problems.push(`wrote "${bad}"`);
  }
  if (c.expect.replyIncludesAny?.length) {
    const replies = t.calls
      .filter((x) => x.name === "ticket_draft_reply")
      .map((x) => String(x.input.body ?? "").toLowerCase());
    const hit = c.expect.replyIncludesAny.some((w) =>
      replies.some((r) => r.includes(w.toLowerCase())),
    );
    if (!hit) problems.push(`reply didn't mention any of: ${c.expect.replyIncludesAny.join(", ")}`);
  }
  return problems;
}

export function evalScore(results: { problems: string[] }[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.problems.length === 0).length / results.length;
}
