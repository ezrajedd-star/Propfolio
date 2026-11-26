import { describe, expect, it } from "vitest";

import { checkEval, evalScore, type EvalCase } from "./evals";

const base: EvalCase = { name: "x", message: "m", expect: {} };

describe("checkEval", () => {
  it.each<[string, EvalCase["expect"], Parameters<typeof checkEval>[1], number]>([
    [
      "calls present",
      { calls: ["ticket_read"] },
      { calls: [{ name: "ticket_read", input: {} }], finalText: "" },
      0,
    ],
    ["call missing", { calls: ["ticket_handover"] }, { calls: [], finalText: "" }, 1],
    [
      "forbidden call",
      { neverCalls: ["ticket_draft_reply"] },
      { calls: [{ name: "ticket_draft_reply", input: { body: "hi" } }], finalText: "" },
      1,
    ],
    [
      "callWith flags",
      { callWith: [{ tool: "ticket_draft_reply", input: { flags: ["refund"] } }] },
      {
        calls: [{ name: "ticket_draft_reply", input: { flags: ["refund", "pricing"] } }],
        finalText: "",
      },
      0,
    ],
    [
      "callWith text, any case",
      { callWith: [{ tool: "github_issue_create", input: { title: "calendar" } }] },
      {
        calls: [{ name: "github_issue_create", input: { title: "Calendar doesn't load" } }],
        finalText: "",
      },
      0,
    ],
    [
      "text excluded in a reply",
      { textExcludes: ["discount"] },
      {
        calls: [{ name: "ticket_draft_reply", input: { body: "Here is a DISCOUNT" } }],
        finalText: "",
      },
      1,
    ],
    [
      "reply mentions",
      { replyIncludesAny: ["settings", "Units"] },
      {
        calls: [{ name: "ticket_draft_reply", input: { body: "Open Settings → Buildings" } }],
        finalText: "",
      },
      0,
    ],
    [
      "reply doesn't mention",
      { replyIncludesAny: ["settings"] },
      { calls: [{ name: "ticket_draft_reply", input: { body: "Sorry" } }], finalText: "" },
      1,
    ],
  ])("%s", (_name, expectation, transcript, problems) => {
    expect(checkEval({ ...base, expect: expectation }, transcript)).toHaveLength(problems);
  });
});

it("evalScore", () => {
  expect(evalScore([{ problems: [] }, { problems: ["x"] }])).toBe(0.5);
  expect(evalScore([])).toBe(0);
});
