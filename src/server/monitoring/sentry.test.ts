import { describe, expect, it } from "vitest";

import { buildEnvelope, parseSentryDsn, stackFrames } from "./sentry";

describe("Sentry DSN", () => {
  it.each([
    [
      "https://abc123@o4507.ingest.sentry.io/4508",
      { endpoint: "https://o4507.ingest.sentry.io/api/4508/envelope/", publicKey: "abc123" },
    ],
    ["", null],
    [undefined, null],
    ["not a url", null],
    ["http://abc@sentry.example/12", null], // must be HTTPS
    ["https://sentry.example/12", null], // no key
    ["https://abc@sentry.example/project", null],
  ])("%j", (dsn, expected) => {
    expect(parseSentryDsn(dsn)).toEqual(expected);
  });
});

describe("error reports", () => {
  const err = new TypeError("duplicate key value (email)=(maria@example.com)");
  err.stack = [
    "TypeError: duplicate key value (email)=(maria@example.com)",
    "    at createUser (/app/src/server/users/service.ts:120:11)",
    "    at async runAction (/app/src/server/actions.ts:20:24)",
    "    at Module._compile (node:internal/modules/cjs/loader:1706:14)",
    "    at /app/node_modules/next/dist/server.js:5:1",
  ].join("\n");

  it("turn stack lines into frames, oldest first, marking our own code", () => {
    expect(stackFrames(err.stack)).toEqual([
      {
        filename: "/app/node_modules/next/dist/server.js",
        function: "?",
        lineno: 5,
        colno: 1,
        in_app: false,
      },
      {
        filename: "node:internal/modules/cjs/loader",
        function: "Module._compile",
        lineno: 1706,
        colno: 14,
        in_app: false,
      },
      {
        filename: "/app/src/server/actions.ts",
        function: "async runAction",
        lineno: 20,
        colno: 24,
        in_app: true,
      },
      {
        filename: "/app/src/server/users/service.ts",
        function: "createUser",
        lineno: 120,
        colno: 11,
        in_app: true,
      },
    ]);
  });

  it("send the error type and where it happened, never the message", () => {
    const envelope = buildEnvelope(err, {
      where: "action",
      environment: "uat",
      eventId: "0123456789abcdef0123456789abcdef",
      now: new Date("2026-11-03T00:00:00Z"),
    });
    const [header, item, event] = envelope
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(header).toEqual({
      event_id: "0123456789abcdef0123456789abcdef",
      sent_at: "2026-11-03T00:00:00.000Z",
    });
    expect(item).toEqual({ type: "event" });
    expect(event).toMatchObject({
      level: "error",
      environment: "uat",
      tags: { where: "action" },
      exception: { values: [{ type: "TypeError", value: "(message not sent)" }] },
    });
    expect(envelope).not.toContain("maria");
    expect(envelope).not.toContain("duplicate key");
  });
});
