import { beforeEach, describe, expect, it } from "vitest";

import { buildDigest, sendMondayDigest } from "@/server/digest/service";
import { asSystem, db } from "@/server/db";
import type { OutgoingMail } from "@/server/mail/transport";
import { resetDb } from "./helpers";

beforeEach(resetDb);

// Monday 4 Jan 2027, 7:00 AM Manila (clear of the test account, made today).
const MONDAY = new Date("2027-01-03T23:00:00Z");
const NEXT_MONDAY = new Date(MONDAY.getTime() + 7 * 86_400_000);

function mailbox() {
  const sent: OutgoingMail[] = [];
  return {
    sent,
    deps: { send: async (m: OutgoingMail) => void sent.push(m), summarise: async () => null },
  };
}

async function owner(email = "owner@propfolio.test") {
  await asSystem(() =>
    db.platformAdmin.create({
      data: { email, name: "Owner", role: "PLATFORM_OWNER", totpConfirmedAt: new Date() },
    }),
  );
}

describe("the Monday digest", () => {
  it("covers last week, goes to active Platform Owners only, once a week", async () => {
    await owner();
    await asSystem(() =>
      db.platformAdmin.create({
        data: {
          email: "support@propfolio.test",
          name: "S",
          role: "PLATFORM_SUPPORT",
          totpConfirmedAt: new Date(),
        },
      }),
    );
    // Two sign-ups last week (Mon 28 Dec – Sun 3 Jan, Manila), one this week.
    await asSystem(async () => {
      await db.account.create({ data: { name: "A", createdAt: new Date("2026-12-29T02:00:00Z") } });
      await db.account.create({ data: { name: "B", createdAt: new Date("2027-01-02T02:00:00Z") } });
      await db.account.create({ data: { name: "C", createdAt: new Date("2027-01-03T23:30:00Z") } });
    });
    const box = mailbox();
    expect(await sendMondayDigest(MONDAY, box.deps)).toBe("sent");
    expect(box.sent).toHaveLength(1);
    expect(box.sent[0]!.to).toEqual(["owner@propfolio.test"]);
    expect(box.sent[0]!.subject).toBe("Monday digest: 28 Dec 2026 to 3 Jan 2027");
    expect(box.sent[0]!.text).toMatch(/^Sign-ups last week: 2$/m);
    expect(box.sent[0]!.text).toMatch(/\/platform\/approvals/);
    expect(await sendMondayDigest(MONDAY, box.deps)).toBe("already_sent");
    expect(box.sent).toHaveLength(1);
  });

  it("compares with the previous week's digest", async () => {
    await owner();
    const box = mailbox();
    await sendMondayDigest(MONDAY, box.deps);
    await asSystem(() =>
      db.account.create({ data: { name: "D", createdAt: new Date("2027-01-05T02:00:00Z") } }),
    );
    const d = await buildDigest(NEXT_MONDAY, { summarise: async () => null });
    const row = d.rows.find((r) => r.label === "Sign-ups last week")!;
    expect(row).toMatchObject({ now: "1", change: "+1 vs last week" });
  });

  it("includes the agents' summary when there is one, and each agent's spend", async () => {
    await owner();
    const d = await buildDigest(MONDAY, { summarise: async () => "A quiet week." });
    expect(d.summary).toBe("A quiet week.");
    expect(d.agents.map((a) => a.name)).toContain("Support agent");
    expect(d.agents[0]!.cap).toBe("$40.00");
  });

  it("isn't sent when there is no Platform Owner", async () => {
    expect(await sendMondayDigest(MONDAY, mailbox().deps)).toBe("no_owners");
  });
});
