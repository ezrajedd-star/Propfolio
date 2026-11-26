import { describe, expect, it } from "vitest";

import { alertText, parseBetterStack, parseSentry } from "./webhooks";

const bs = (attributes: Record<string, unknown>, id: unknown = "42") => ({
  data: { id, type: "incident", attributes },
});

describe("parseBetterStack", () => {
  it.each([
    [
      "started opens an urgent incident",
      bs({
        name: "propfolioph.com",
        url: "https://propfolioph.com/api/health",
        cause: "Status 503",
        status: "Started",
        started_at: "2026-11-26T01:00:00Z",
      }),
      {
        action: "open",
        externalId: "42",
        title: "propfolioph.com is down",
        severity: "URGENT",
        link: "https://propfolioph.com/api/health",
      },
    ],
    ["resolved resolves", bs({ name: "x", status: "Resolved" }), { action: "resolve" }],
    [
      "a resolved time resolves",
      bs({ name: "x", resolved_at: "2026-11-26T02:00:00Z" }),
      { action: "resolve" },
    ],
    ["no status opens", bs({ name: "x" }), { action: "open" }],
    ["a numeric id works", bs({ name: "x", status: "Started" }, 7), { externalId: "7" }],
    ["a non-https link is dropped", bs({ name: "x", url: "http://x" }), { link: null }],
  ])("%s", (_name, body, expected) => {
    expect(parseBetterStack(body)).toMatchObject(expected);
  });

  it.each([
    ["acknowledged changes nothing", bs({ name: "x", status: "Acknowledged" })],
    ["no id", bs({ name: "x" }, null)],
    ["not an object", "hello"],
    ["no attributes", { data: { id: "1" } }],
  ])("%s → null", (_name, body) => {
    expect(parseBetterStack(body)).toBeNull();
  });

  it("keeps long names short", () => {
    expect(parseBetterStack(bs({ name: "n".repeat(500) }))!.title.length).toBeLessThan(120);
  });
});

describe("parseSentry", () => {
  it.each([
    [
      "legacy webhook",
      {
        id: "99",
        project_name: "propfolio",
        culprit: "worker:subscriptions",
        level: "error",
        url: "https://sentry.io/issues/99/",
        message: "Tenant Juan's phone 0917…",
      },
      {
        action: "open",
        externalId: "99",
        title: "Error in worker:subscriptions",
        severity: "NORMAL",
        link: "https://sentry.io/issues/99/",
      },
    ],
    [
      "integration event alert",
      {
        data: {
          event: {
            issue_id: 5,
            title: "TypeError: x is undefined",
            level: "fatal",
            web_url: "https://sentry.io/i/5",
          },
        },
      },
      { externalId: "5", title: "TypeError", severity: "URGENT" },
    ],
  ])("%s", (_name, body, expected) => {
    expect(parseSentry(body)).toMatchObject(expected);
  });

  it("never keeps the error message", () => {
    const s = parseSentry({
      id: "1",
      message: "Tenant Juan dela Cruz 0917 555 1234",
      culprit: "x",
    });
    expect(JSON.stringify(s)).not.toMatch(/Juan|0917/);
  });

  it.each([[null], [{}], [{ data: {} }], ["text"]])("%j → null", (body) => {
    expect(parseSentry(body)).toBeNull();
  });
});

describe("alertText", () => {
  it.each([
    [{ title: "Site is down", severity: "URGENT" as const }, false, "Propfolio: urgent"],
    [{ title: "TypeError", severity: "NORMAL" as const }, false, "Propfolio: needs a look"],
    [{ title: "Site is down", severity: "URGENT" as const }, true, "Resolved"],
  ])("%j resolved=%s", (signal, resolved, title) => {
    expect(alertText(signal, resolved).title).toBe(title);
  });
});
