process.env.MARKETING_MAIL_FROM = "Propfolio <hello@news.propfolio.test>";
process.env.SUPPORT_EMAIL = "support@propfolio.example";

import { beforeEach, describe, expect, it } from "vitest";

import { approve } from "@/server/agents/approvals";
import { callAgentAction } from "@/server/agents/gateway";
import { growthDailyTask, growthWeeklyTask, runGrowthDaily } from "@/server/agents/growth";
import { asSystem, db } from "@/server/db";
import { logOutbox } from "@/server/mail/transport";
import { talkTodayForConsole, talkTodayList } from "@/server/pipeline/talk-today";
import { TEST_ACCOUNT_ID, makeStaff, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-11-26T02:00:00Z");

async function growthOn() {
  await asSystem(() =>
    db.agentState.create({ data: { agentKey: "GROWTH", enabled: true, firstEnabledAt: NOW } }),
  );
}

async function lead(data: Record<string, unknown>) {
  return asSystem(() =>
    db.lead.create({
      data: { name: "Lead", source: "MY_NETWORK", lastActivityAt: NOW, ...data } as never,
    }),
  );
}

describe("talk to today", () => {
  it("ranks by buying signals with reasons, leaving paying and lost leads out", async () => {
    await asSystem(async () => {
      await db.account.update({
        where: { id: TEST_ACCOUNT_ID },
        data: { trialEndsAt: new Date(NOW.getTime() + 3 * 86_400_000) },
      });
    });
    await lead({ name: "Trial ending", accountId: TEST_ACCOUNT_ID, stage: "TRIAL" });
    await lead({ name: "Follow-up due", nextFollowUp: new Date("2026-11-26") });
    await lead({ name: "Paying", stage: "PAYING", nextFollowUp: new Date("2026-11-26") });
    await lead({ name: "Nothing yet" });
    const list = await talkTodayList(NOW);
    expect(list.map((l) => l.name)).toEqual(["Trial ending", "Follow-up due"]);
    expect(list[0]!.reasons).toContain("Trial ends in 3 days");
    const ro = await makeStaff("PLATFORM_READONLY");
    expect(await talkTodayForConsole(ro, NOW)).toHaveLength(2);
  });

  it("the agent gets the same list through its own action", async () => {
    await growthOn();
    await lead({ name: "Due", nextFollowUp: new Date("2026-11-26") });
    const r = await callAgentAction("GROWTH", "talk_today_list", {}, NOW);
    expect(r).toMatchObject({ ok: true });
    expect(JSON.stringify(r.ok ? r.data : null)).toMatch(/Follow-up is due today/);
  });
});

describe("outreach rules the gateway enforces", () => {
  it("refuses a nurture email to a lead without marketing consent", async () => {
    await growthOn();
    const l = await lead({ name: "No consent", email: "no.consent@example.test" });
    const r = await callAgentAction(
      "GROWTH",
      "approval_submit",
      {
        actionType: "NURTURE_EMAIL",
        title: "Hello there",
        body: "Hello",
        details: { leadId: l.id, subject: "Hi" },
      },
      NOW,
    );
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.message).toMatch(/agreed to marketing/);
    expect(await asSystem(() => db.approval.count())).toBe(0);
  });

  it("a nurture email to a consenting lead waits, then goes from the marketing sender", async () => {
    await growthOn();
    const l = await lead({
      name: "Yes",
      email: "yes@example.com",
      marketingConsent: true,
      consentAt: NOW,
      consentSource: "Demo call",
    });
    const r = await callAgentAction(
      "GROWTH",
      "approval_submit",
      {
        actionType: "NURTURE_EMAIL",
        title: "Import your leases",
        body: "You can import your leases from Excel in a few minutes.",
        details: { leadId: l.id, subject: "Import your leases" },
      },
      NOW,
    );
    expect(r).toMatchObject({ ok: true, data: { status: "waiting_for_approval" } });
    const a = await asSystem(() => db.approval.findFirstOrThrow());
    logOutbox.length = 0;
    await approve(await makeStaff("PLATFORM_OWNER"), a.id, {}, meta, NOW);
    const mail = logOutbox.at(-1)!;
    expect(mail.from).toBe("Propfolio <hello@news.propfolio.test>");
    expect(mail.to).toEqual(["yes@example.com"]);
    expect(mail.headers?.["List-Unsubscribe"]).toMatch(/support@propfolio\.example/);
  });

  it("consent withdrawn after drafting: the approved email is refused", async () => {
    await growthOn();
    const l = await lead({
      name: "Changed mind",
      email: "c@example.com",
      marketingConsent: true,
      consentAt: NOW,
    });
    await callAgentAction(
      "GROWTH",
      "approval_submit",
      {
        actionType: "NURTURE_EMAIL",
        title: "Hello there",
        body: "Hello",
        details: { leadId: l.id, subject: "Hi" },
      },
      NOW,
    );
    await asSystem(() =>
      db.lead.update({
        where: { id: l.id },
        data: { marketingConsent: false, unsubscribedAt: NOW },
      }),
    );
    const a = await asSystem(() => db.approval.findFirstOrThrow());
    await expect(approve(await makeStaff("PLATFORM_OWNER"), a.id, {}, meta, NOW)).rejects.toThrow(
      /consent/,
    );
  });

  it("posts never go to Facebook groups; personal follow-ups always wait", async () => {
    await growthOn();
    const group = await callAgentAction(
      "GROWTH",
      "approval_submit",
      {
        actionType: "CONTENT_POST",
        title: "Post",
        body: "Tips",
        details: { channel: "Facebook group: Landlords PH" },
      },
      NOW,
    );
    expect(group).toMatchObject({ ok: false });
    const owner = await makeStaff("PLATFORM_OWNER");
    const { setAutonomy } = await import("@/server/agents/state");
    await expect(
      setAutonomy(owner, "GROWTH", "FOLLOW_UP_DRAFT", "ACT", meta),
    ).resolves.toBeUndefined();
    const l = await lead({ name: "Friend" });
    const r = await callAgentAction(
      "GROWTH",
      "approval_submit",
      {
        actionType: "FOLLOW_UP_DRAFT",
        title: "Follow up",
        body: "Hi!",
        details: { leadId: l.id, channel: "Viber" },
      },
      NOW,
    );
    expect(r).toMatchObject({ ok: true, data: { status: "waiting_for_approval" } });
  });

  it("the agent can't mark a lead Paying or Lost", async () => {
    await growthOn();
    const l = await lead({ name: "L" });
    expect(
      await callAgentAction("GROWTH", "lead_update", { leadId: l.id, stage: "PAYING" }, NOW),
    ).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });
});

describe("the Growth agent's runs", () => {
  it("daily and weekly tasks state the rules", () => {
    expect(growthDailyTask("2026-11-26")).toMatch(/Never for leads without consent/);
    expect(growthDailyTask("2026-11-26")).toMatch(/₱1,500\.00/);
    expect(growthWeeklyTask("2026-11-30")).toMatch(/Never for Facebook groups/);
    expect(growthWeeklyTask("2026-11-30")).toMatch(/accountant or lawyer/);
  });

  it("the daily run goes through the runner", async () => {
    const calls: string[] = [];
    await runGrowthDaily(NOW, async (req) => {
      calls.push(req.purpose);
      return { ran: false, reason: "test" };
    });
    expect(calls).toEqual(["daily-list"]);
  });
});
