process.env.AGENT_KEY_SUPPORT = "support-gateway-key-for-tests-0123456789";
process.env.AGENT_KEY_GROWTH = "growth-gateway-key-for-tests-0123456789ab";
process.env.MANAGED_AGENTS_ENVIRONMENT_ID = "env_test";
process.env.MANAGED_AGENT_ID_SUPPORT = "agent_test";

import { beforeEach, describe, expect, it } from "vitest";

import { AGENTS, AGENT_KEYS } from "@/config/agents";
import { ACTIONS } from "@/server/agents/actions";
import { approve, reject, remindWaitingApprovals } from "@/server/agents/approvals";
import { agentForKey, callAgentAction } from "@/server/agents/gateway";
import { deleteOldAgentSessions, runManagedAgent } from "@/server/agents/runner";
import { recordUsage, setAgentEnabled, setAutonomy } from "@/server/agents/state";
import { asSystem, db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { logOutbox } from "@/server/mail/transport";
import { createTicket } from "@/server/tickets/service";
import { TEST_ACCOUNT_ID, makeStaff, makeTenant, makeUser, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-11-26T02:00:00Z");
const noMail = { send: async () => {} };

async function switchOn(key: "SUPPORT" | "GROWTH", startedDaysAgo = 40) {
  await asSystem(() =>
    db.agentState.create({
      data: {
        agentKey: key,
        enabled: true,
        firstEnabledAt: new Date(NOW.getTime() - startedDaysAgo * 86_400_000),
      },
    }),
  );
}

async function ticket(
  description = "How do I add a second building? My tenant Juan Santos (0917 123 4567) asked.",
  category = "HOW_TO",
  language = "EN",
) {
  const user = await makeUser("ADMIN");
  return createTicket(user, { category, language, description }, null, meta, NOW, noMail);
}

describe("the agent API's limits", () => {
  it("lists only real actions, and none of the staff support tools", () => {
    const names = new Set(ACTIONS.map((a) => a.name));
    for (const key of AGENT_KEYS) {
      for (const a of AGENTS[key].actions) expect(names.has(a), `${key}: ${a}`).toBe(true);
    }
    for (const forbidden of [
      "extend_trial",
      "unlock_user",
      "reset_two_step",
      "correct_billing",
      "resend_signup_code",
      "support_access",
      "record_payment",
      "change_plan",
      "tenant_read",
      "sql",
    ]) {
      expect([...names].some((n) => n.includes(forbidden))).toBe(false);
    }
  });

  it("refuses an agent that is switched off", async () => {
    const r = await callAgentAction("SUPPORT", "today_metrics", {}, NOW);
    expect(r).toMatchObject({ ok: false, error: "refused" });
    const log = await asSystem(() => db.agentActionLog.findFirstOrThrow());
    expect(log).toMatchObject({ agentKey: "SUPPORT", ok: false });
  });

  it("refuses actions outside the agent's own list", async () => {
    await switchOn("SUPPORT");
    expect(
      await callAgentAction("SUPPORT", "lead_update", { leadId: crypto.randomUUID() }, NOW),
    ).toMatchObject({ ok: false, error: "refused" });
    expect(await callAgentAction("SUPPORT", "extend_trial", {}, NOW)).toMatchObject({
      ok: false,
      error: "refused",
    });
  });

  it("checks the input", async () => {
    await switchOn("SUPPORT");
    expect(
      await callAgentAction("SUPPORT", "ticket_read", { ticketId: "not-a-uuid" }, NOW),
    ).toMatchObject({ ok: false, error: "invalid" });
  });

  it("stops at the monthly cap, switches itself off and logs it", async () => {
    await switchOn("SUPPORT");
    await recordUsage("SUPPORT", { inputTokens: 10_000_000, outputTokens: 0 }, NOW); // $40
    const state = await asSystem(() =>
      db.agentState.findUniqueOrThrow({ where: { agentKey: "SUPPORT" } }),
    );
    expect(state).toMatchObject({ enabled: false, stoppedReason: "Monthly cap reached" });
    expect(await callAgentAction("SUPPORT", "today_metrics", {}, NOW)).toMatchObject({ ok: false });
    expect(
      await asSystem(() => db.staffLog.count({ where: { action: "agent.stopped_at_cap" } })),
    ).toBe(1);
    const owner = await makeStaff("PLATFORM_OWNER");
    await expect(setAgentEnabled(owner, "SUPPORT", true, meta, NOW)).rejects.toThrow(/monthly cap/);
  });

  it("each agent has its own key", () => {
    expect(agentForKey("support-gateway-key-for-tests-0123456789")).toBe("SUPPORT");
    expect(agentForKey("growth-gateway-key-for-tests-0123456789ab")).toBe("GROWTH");
    expect(agentForKey("wrong-key-wrong-key-wrong-key-wrong-key")).toBeNull();
    expect(agentForKey(null)).toBeNull();
  });
});

describe("what agents can see", () => {
  it("ticket text is masked: tenant names, phones; staff notes are left out", async () => {
    await switchOn("SUPPORT");
    await makeTenant(await makeUser("ADMIN"), "Juan Santos");
    const t = await ticket();
    await asSystem(() =>
      db.ticketMessage.create({
        data: {
          ticketId: t.id,
          author: "STAFF",
          authorName: "Sam",
          body: "Internal only",
          internal: true,
        },
      }),
    );
    const r = await callAgentAction("SUPPORT", "ticket_read", { ticketId: t.id }, NOW);
    expect(r.ok).toBe(true);
    const text = JSON.stringify(r.ok ? r.data : null);
    expect(text).not.toMatch(/Juan Santos|0917/);
    expect(text).toMatch(/\[tenant\]/);
    expect(text).toMatch(/\[phone\]/);
    expect(text).not.toMatch(/Internal only/);
  });

  it("an account summary has counts, never tenant records", async () => {
    await switchOn("SUPPORT");
    await makeTenant(await makeUser("ADMIN"), "Secret Tenant Co");
    const r = await callAgentAction(
      "SUPPORT",
      "account_summary",
      { accountId: TEST_ACCOUNT_ID },
      NOW,
    );
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.ok ? r.data : null)).not.toMatch(/Secret Tenant/);
  });
});

describe("autonomy", () => {
  it("everything starts at Draft: a reply waits in the approval inbox", async () => {
    await switchOn("SUPPORT");
    const t = await ticket();
    const r = await callAgentAction(
      "SUPPORT",
      "ticket_draft_reply",
      { ticketId: t.id, body: "Open Settings → Buildings and units, then Add building." },
      NOW,
    );
    expect(r).toMatchObject({ ok: true, data: { status: "waiting_for_approval" } });
    const a = await asSystem(() => db.approval.findFirstOrThrow());
    expect(a).toMatchObject({ status: "PENDING", actionType: "TICKET_REPLY", entityId: t.id });
    expect(await asSystem(() => db.ticketMessage.count({ where: { author: "AGENT" } }))).toBe(0);
  });

  it("at Act, an ordinary English reply goes out; at Act and tell it is also reported", async () => {
    await switchOn("SUPPORT");
    const owner = await makeStaff("PLATFORM_OWNER");
    await setAutonomy(owner, "SUPPORT", "TICKET_REPLY", "ACT", meta);
    const t = await ticket();
    const r = await callAgentAction(
      "SUPPORT",
      "ticket_draft_reply",
      { ticketId: t.id, body: "Here's how." },
      NOW,
    );
    expect(r).toMatchObject({ ok: true, data: { status: "done" } });
    expect(await asSystem(() => db.ticketMessage.count({ where: { author: "AGENT" } }))).toBe(1);
    expect(await asSystem(() => db.approval.count())).toBe(0);
    await setAutonomy(owner, "SUPPORT", "TICKET_REPLY", "ACT_AND_TELL", meta);
    await callAgentAction(
      "SUPPORT",
      "ticket_draft_reply",
      { ticketId: t.id, body: "More help." },
      NOW,
    );
    expect((await asSystem(() => db.approval.findFirstOrThrow())).status).toBe("TOLD");
  });

  it.each([
    ["a billing ticket", "Please send me my October receipt.", "BILLING", "EN", null],
    ["a privacy request", "Please delete my data now.", "PRIVACY", "EN", null],
    ["a refund asked in words", "I'd like a refund for this month please.", "HOW_TO", "EN", null],
    ["a legal threat", "My lawyer will hear about this.", "COMPLAINT", "EN", null],
    ["an access change", "Make me the owner of the account please.", "OTHER", "EN", null],
    ["Tagalog in the first month", "Paano magdagdag ng unit?", "HOW_TO", "TL", 5],
  ])("%s always waits, even at Act", async (_name, text, category, language, startedDaysAgo) => {
    await switchOn("SUPPORT", startedDaysAgo ?? 40);
    const owner = await makeStaff("PLATFORM_OWNER");
    await setAutonomy(owner, "SUPPORT", "TICKET_REPLY", "ACT", meta);
    const t = await ticket(text, category, language);
    const r = await callAgentAction(
      "SUPPORT",
      "ticket_draft_reply",
      { ticketId: t.id, body: "Reply." },
      NOW,
    );
    expect(r).toMatchObject({ ok: true, data: { status: "waiting_for_approval" } });
    expect((await asSystem(() => db.approval.findFirstOrThrow())).lockedBecause).toBeTruthy();
  });

  it("a reply mentioning a price that isn't in our plans waits", async () => {
    await switchOn("SUPPORT");
    const owner = await makeStaff("PLATFORM_OWNER");
    await setAutonomy(owner, "SUPPORT", "TICKET_REPLY", "ACT", meta);
    const t = await ticket("How much is Pro?");
    await callAgentAction(
      "SUPPORT",
      "ticket_draft_reply",
      { ticketId: t.id, body: "For you, ₱999 a month." },
      NOW,
    );
    expect((await asSystem(() => db.approval.findFirstOrThrow())).status).toBe("PENDING");
  });

  it("only a Platform Owner changes autonomy or switches agents", async () => {
    const support = await makeStaff("PLATFORM_SUPPORT");
    await expect(
      setAutonomy(support, "SUPPORT", "TICKET_REPLY", "ACT", meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAgentEnabled(support, "SUPPORT", true, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const owner = await makeStaff("PLATFORM_OWNER");
    await expect(setAutonomy(owner, "SUPPORT", "LEAD_UPDATE", "ACT", meta)).rejects.toThrow(
      /doesn't do that/,
    );
    await setAgentEnabled(owner, "SUPPORT", true, meta, NOW);
    expect(
      await asSystem(() => db.staffLog.count({ where: { action: "agent.switched_on" } })),
    ).toBe(1);
  });
});

describe("the approval inbox", () => {
  async function pendingReply() {
    await switchOn("SUPPORT");
    const t = await ticket();
    await callAgentAction(
      "SUPPORT",
      "ticket_draft_reply",
      { ticketId: t.id, body: "Draft text." },
      NOW,
    );
    return { t, a: await asSystem(() => db.approval.findFirstOrThrow()) };
  }

  it("approving sends the reply; an edit is saved and used", async () => {
    const { t, a } = await pendingReply();
    const owner = await makeStaff("PLATFORM_OWNER", "Olga");
    await approve(owner, a.id, { editedText: "Edited text." }, meta, NOW);
    const m = await asSystem(() =>
      db.ticketMessage.findFirstOrThrow({ where: { author: "AGENT" } }),
    );
    expect(m).toMatchObject({ ticketId: t.id, body: "Edited text." });
    expect(m.authorName).toMatch(/checked by Olga/);
    const after = await asSystem(() => db.approval.findUniqueOrThrow({ where: { id: a.id } }));
    expect(after).toMatchObject({
      status: "APPROVED",
      editedPreview: "Edited text.",
      decidedByName: "Olga",
    });
    expect(after.executedAt).not.toBeNull();
    await expect(approve(owner, a.id, {}, meta, NOW)).rejects.toThrow(/already decided/);
  });

  it("rejecting needs a reason, which is saved; Support can't decide", async () => {
    const { a } = await pendingReply();
    const support = await makeStaff("PLATFORM_SUPPORT");
    await expect(approve(support, a.id, {}, meta)).rejects.toBeInstanceOf(ForbiddenError);
    const owner = await makeStaff("PLATFORM_OWNER");
    await expect(reject(owner, a.id, " ", meta)).rejects.toBeInstanceOf(ValidationError);
    await reject(owner, a.id, "We don't promise dates", meta, NOW);
    expect(
      await asSystem(() => db.approval.findUniqueOrThrow({ where: { id: a.id } })),
    ).toMatchObject({
      status: "REJECTED",
      reason: "We don't promise dates",
    });
    expect(await asSystem(() => db.ticketMessage.count({ where: { author: "AGENT" } }))).toBe(0);
  });

  it("a failure when carrying it out is recorded", async () => {
    const { t, a } = await pendingReply();
    await asSystem(async () => {
      await db.ticketMessage.deleteMany({ where: { ticketId: t.id } });
      await db.ticket.delete({ where: { id: t.id } });
    });
    const owner = await makeStaff("PLATFORM_OWNER");
    await expect(approve(owner, a.id, {}, meta, NOW)).rejects.toThrow(/couldn't be carried out/);
    expect(
      (await asSystem(() => db.approval.findUniqueOrThrow({ where: { id: a.id } }))).status,
    ).toBe("FAILED");
  });

  it("owners are reminded of items waiting more than 12 hours", async () => {
    await pendingReply();
    await asSystem(async () => {
      await db.platformAdmin.create({
        data: {
          email: "owner@propfolio.test",
          name: "Owner",
          role: "PLATFORM_OWNER",
          totpConfirmedAt: NOW,
        },
      });
    });
    logOutbox.length = 0;
    expect(await remindWaitingApprovals(new Date(NOW.getTime() + 2 * 3_600_000))).toBe(0);
    expect(await remindWaitingApprovals(new Date(NOW.getTime() + 13 * 3_600_000))).toBe(1);
    expect(logOutbox.at(-1)?.subject).toBe("1 approval waiting");
  });
});

describe("the Managed Agents runner", () => {
  function fakeClient(toolCalls: { name: string; input: unknown }[]) {
    const sent: unknown[] = [];
    const client = {
      beta: {
        sessions: {
          create: async () => ({ id: "sesn_test" }),
          retrieve: async () => ({
            usage: { input_tokens: 1000, output_tokens: 200, active_seconds: 60 },
          }),
          archive: async () => ({}),
          delete: async () => ({}),
          events: {
            send: async (_id: string, body: unknown) => void sent.push(body),
            stream: async () =>
              (async function* () {
                for (const [i, c] of toolCalls.entries()) {
                  yield {
                    type: "agent.custom_tool_use",
                    id: `sevt_${i}`,
                    name: c.name,
                    input: c.input,
                  };
                }
                yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
              })(),
          },
        },
      },
    };
    return { client: client as never, sent };
  }

  it("answers tool calls through the gateway, records cost, and refuses when off", async () => {
    const off = fakeClient([]);
    expect(
      await runManagedAgent(
        { agentKey: "SUPPORT", purpose: "ticket", message: "x" },
        NOW,
        off.client,
      ),
    ).toMatchObject({
      ran: false,
    });
    await switchOn("SUPPORT");
    const t = await ticket();
    const run = fakeClient([
      { name: "ticket_read", input: { ticketId: t.id } },
      { name: "extend_trial", input: {} },
    ]);
    const r = await runManagedAgent(
      { agentKey: "SUPPORT", purpose: "ticket", entityId: t.id, message: "x" },
      NOW,
      run.client,
    );
    expect(r).toMatchObject({ ran: true, toolCalls: 2 });
    const results = JSON.stringify(run.sent);
    expect(results).toMatch(/\[phone\]/);
    expect(results).toMatch(/isn't one of this agent's actions/);
    const session = await asSystem(() => db.agentSession.findFirstOrThrow());
    expect(session).toMatchObject({ externalId: "sesn_test", status: "finished" });
    const usage = await asSystem(() => db.agentUsage.findFirstOrThrow());
    expect(Number(usage.costUsd)).toBeGreaterThan(0);
  });

  it("deletes session history older than 30 days", async () => {
    await asSystem(() =>
      db.agentSession.createMany({
        data: [
          {
            agentKey: "SUPPORT",
            externalId: "old",
            purpose: "t",
            createdAt: new Date(NOW.getTime() - 31 * 86_400_000),
          },
          {
            agentKey: "SUPPORT",
            externalId: "new",
            purpose: "t",
            createdAt: new Date(NOW.getTime() - 5 * 86_400_000),
          },
        ],
      }),
    );
    const deleted: string[] = [];
    const client = {
      beta: { sessions: { delete: async (id: string) => void deleted.push(id) } },
    } as never;
    expect(await deleteOldAgentSessions(NOW, () => client)).toBe(1);
    expect(deleted).toEqual(["old"]);
  });
});
