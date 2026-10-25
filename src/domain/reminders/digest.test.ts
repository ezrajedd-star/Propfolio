import { describe, expect, it } from "vitest";

import {
  buildDigest,
  digestSubject,
  reminderReason,
  summariseReminders,
  type DigestLease,
} from "./digest";

const lease = (o: Partial<DigestLease>): DigestLease => ({
  leaseId: "id-1",
  refNo: "LSE-2026-0001",
  tenantName: "ABC Corporation",
  unitLabel: "Unit 1001",
  buildingName: "Tower One",
  startDate: "2025-01-01",
  endDate: "2026-12-31",
  reminders: [{ date: "2026-10-23", kind: "EXPIRY", daysBefore: 69 }],
  ...o,
});

describe("digest", () => {
  it.each([
    [1, "Lease reminders – 1 lease needs attention (23 Oct 2026)"],
    [3, "Lease reminders – 3 leases need attention (23 Oct 2026)"],
  ])("subject for %i", (n, expected) => {
    expect(digestSubject(n, "2026-10-23")).toBe(expected);
  });

  it("lists leases soonest first, with a link and plain reasons", () => {
    const d = buildDigest(
      [
        lease({ leaseId: "a", refNo: "LSE-2026-0001" }),
        lease({
          leaseId: "b",
          refNo: "LSE-2026-0002",
          endDate: "2026-11-22",
          reminders: [{ date: "2026-10-23", kind: "EXPIRY", daysBefore: 30 }],
        }),
        lease({ leaseId: "c", reminders: [] }),
      ],
      "2026-10-23",
      "https://leases.example.com/",
    );
    expect(d.items.map((i) => [i.refNo, i.timeLeft, i.reason, i.url])).toEqual([
      [
        "LSE-2026-0002",
        "Ends in 30 days",
        "30-day reminder before the lease ends",
        "https://leases.example.com/leases/b",
      ],
      [
        "LSE-2026-0001",
        "Ends in 2 months",
        "69-day reminder before the lease ends",
        "https://leases.example.com/leases/a",
      ],
    ]);
    expect(d.subject).toContain("2 leases need attention");
  });

  it.each([
    [
      [{ date: "2026-10-23", kind: "REPEAT", daysBefore: 4 }],
      "Repeat reminder: the lease hasn't been renewed or marked as handled yet",
    ],
    [
      [{ date: "2026-10-23", kind: "REPEAT", daysBefore: 0 }],
      "The lease ends today and hasn't been renewed or marked as handled",
    ],
    [
      [{ date: "2026-10-23", kind: "REPEAT", daysBefore: -1 }],
      "The lease ended 1 day ago and hasn't been renewed or marked as handled",
    ],
    [
      [{ date: "2026-10-23", kind: "REPEAT", daysBefore: -9 }],
      "The lease ended 9 days ago and hasn't been renewed or marked as handled",
    ],
    [
      [{ date: "2026-10-21", kind: "EXPIRY", daysBefore: 30 }],
      "30-day reminder before the lease ends (was due 21 Oct 2026)",
    ],
    [
      [
        { date: "2026-10-20", kind: "EXPIRY", daysBefore: 60 },
        { date: "2026-10-23", kind: "EXPIRY", daysBefore: 57 },
      ],
      "57-day reminder before the lease ends",
    ],
  ] as const)("reason %#", (reminders, expected) => {
    expect(reminderReason([...reminders], "2026-10-23")).toBe(expected);
  });
});

describe("reminder status summary", () => {
  const e = (date: string, status: "PENDING" | "SENT" | "FAILED" | "SKIPPED") => ({ date, status });
  it.each([
    [{ handled: true, stopped: false, events: [e("2026-10-01", "SENT")] }, "HANDLED", "Handled"],
    [{ handled: false, stopped: true, events: [] }, "STOPPED", "No more reminders"],
    [
      { handled: false, stopped: false, events: [e("2026-10-01", "FAILED")] },
      "FAILED",
      "Couldn't send — will retry",
    ],
    [
      {
        handled: false,
        stopped: false,
        events: [e("2026-10-01", "SENT"), e("2026-11-01", "PENDING")],
      },
      "SENT",
      "Sent 1 Oct · next 1 Nov 2026",
    ],
    [{ handled: false, stopped: false, events: [e("2026-10-01", "SENT")] }, "SENT", "Sent 1 Oct"],
    [
      {
        handled: false,
        stopped: false,
        events: [e("2026-12-01", "PENDING"), e("2026-11-01", "PENDING")],
      },
      "SCHEDULED",
      "Next: 1 Nov 2026",
    ],
    [{ handled: false, stopped: false, events: [] }, "NONE", "None scheduled"],
  ] as const)("%j → %s", (input, state, label) => {
    const s = summariseReminders({ ...input, events: [...input.events] });
    expect([s.state, s.label]).toEqual([state, label]);
  });
});
