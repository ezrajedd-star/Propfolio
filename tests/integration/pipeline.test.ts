import { beforeEach, describe, expect, it } from "vitest";

import type { BrevoClient, BrevoContact } from "@/server/brevo/client";
import { asSystem, db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { requestDemo } from "@/server/demo/service";
import {
  addLeadActivity,
  createLead,
  deleteLeadForPrivacy,
  getLead,
  importLeads,
  listLeads,
  markUnsubscribed,
  moveLeadStage,
  pipelineEvent,
  runPipelineHousekeeping,
  saveDiscoveryNotes,
  updateLead,
} from "@/server/pipeline/service";
import { TEST_ACCOUNT_ID, makeStaff, meta, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-11-26T02:00:00Z");

function fakeBrevo(unsubscribed: string[] = []) {
  const calls: { op: string; email: string }[] = [];
  const client: BrevoClient = {
    connected: true,
    addToMarketing: async (c: BrevoContact) => void calls.push({ op: "add", email: c.email }),
    removeFromMarketing: async (email) => void calls.push({ op: "remove", email }),
    deleteContact: async (email) => void calls.push({ op: "delete", email }),
    unsubscribedSince: async () => unsubscribed,
  };
  return { client, calls };
}

const lead = (o: Record<string, unknown> = {}) => ({
  name: "Juana Example",
  company: "Example Realty",
  type: "LESSOR",
  email: "juana@example.test",
  source: "EVENT",
  ...o,
});

describe("pipeline permissions", () => {
  it("read-only staff can look but not change", async () => {
    const ro = await makeStaff("PLATFORM_READONLY");
    const support = await makeStaff("PLATFORM_SUPPORT");
    const l = await createLead(support, lead(), meta, NOW, fakeBrevo().client);
    await expect(listLeads(ro)).resolves.toHaveLength(1);
    await expect(getLead(ro, l.id)).resolves.toMatchObject({ name: "Juana Example" });
    await expect(createLead(ro, lead({ email: "x@example.test" }), meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(moveLeadStage(ro, l.id, { stage: "CONTACTED" }, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(importLeads(ro, [{ Name: "A" }], meta)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteLeadForPrivacy(ro, l.id, { reason: "x" }, meta)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("leads by hand", () => {
  it("consent needs an email and where they agreed; emails are unique", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    await expect(
      createLead(s, lead({ email: "", marketingConsent: true }), meta),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createLead(s, lead({ marketingConsent: true, consentSource: "" }), meta),
    ).rejects.toBeInstanceOf(ValidationError);
    const brevo = fakeBrevo();
    await createLead(
      s,
      lead({ marketingConsent: true, consentSource: "Expo sign-up sheet" }),
      meta,
      NOW,
      brevo.client,
    );
    expect(brevo.calls).toEqual([{ op: "add", email: "juana@example.test" }]);
    await expect(createLead(s, lead({ email: "JUANA@example.test" }), meta)).rejects.toThrow(
      /already in the pipeline/,
    );
  });

  it("moves, timeline, discovery notes; lost needs a reason", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT", "Sam");
    const at = (n: number) => new Date(NOW.getTime() + n * 1000);
    const l = await createLead(s, lead(), meta, NOW, fakeBrevo().client);
    await moveLeadStage(s, l.id, { stage: "CONTACTED" }, meta, at(1));
    await expect(moveLeadStage(s, l.id, { stage: "LOST" }, meta)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await moveLeadStage(s, l.id, { stage: "LOST", lostReason: "No budget" }, meta, at(2));
    await addLeadActivity(
      s,
      l.id,
      { kind: "CALL", text: "Called, will think about it" },
      meta,
      at(3),
    );
    await saveDiscoveryNotes(
      s,
      l.id,
      {
        currentTool: "Excel",
        pains: ["Missed renewals", "Late rent", ""],
        painStrength: 4,
        priceSuggested: "₱1,000",
        pilotInterest: "maybe",
        bestQuote: "I lose a weekend every month",
      },
      meta,
      at(4),
    );
    const full = await getLead(s, l.id);
    expect(full).toMatchObject({ stage: "LOST", lostReason: "No budget" });
    expect(full.discovery).toMatchObject({ painStrength: 4, pilotInterest: "maybe" });
    expect(full.activities.map((a) => a.kind)).toEqual([
      "NOTE",
      "CALL",
      "STAGE_CHANGED",
      "STAGE_CHANGED",
      "CREATED",
    ]);
    expect(
      await asSystem(() => db.staffLog.count({ where: { action: { startsWith: "lead." } } })),
    ).toBe(6);
  });

  it("withdrawing consent takes them off the marketing list", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const brevo = fakeBrevo();
    const l = await createLead(
      s,
      lead({ marketingConsent: true, consentSource: "Call" }),
      meta,
      NOW,
      brevo.client,
    );
    await updateLead(s, l.id, lead({ marketingConsent: false }), meta, NOW, brevo.client);
    expect(brevo.calls.at(-1)).toEqual({ op: "remove", email: "juana@example.test" });
    expect((await getLead(s, l.id)).activities.map((a) => a.text)).toContain(
      "Marketing consent withdrawn",
    );
  });

  it("'Follow up today' shows due and overdue leads still in play", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const b = fakeBrevo().client;
    await createLead(
      s,
      lead({ email: "a@example.test", name: "Due", nextFollowUp: "2026-11-26" }),
      meta,
      NOW,
      b,
    );
    await createLead(
      s,
      lead({ email: "b@example.test", name: "Overdue", nextFollowUp: "2026-11-20" }),
      meta,
      NOW,
      b,
    );
    await createLead(
      s,
      lead({ email: "c@example.test", name: "Later", nextFollowUp: "2026-12-20" }),
      meta,
      NOW,
      b,
    );
    expect((await listLeads(s, { followUpToday: true }, NOW)).map((l) => l.name)).toEqual([
      "Overdue",
      "Due",
    ]);
  });
});

describe("automatic moves", () => {
  it("sign-up creates (or links) the lead; first lease, payment and cancellation move it", async () => {
    await pipelineEvent("signup", TEST_ACCOUNT_ID, NOW, {
      name: "Maria",
      email: "Maria@Example.test",
      company: "Santos Realty",
    });
    const stage = async () =>
      (await asSystem(() => db.lead.findUniqueOrThrow({ where: { accountId: TEST_ACCOUNT_ID } })))
        .stage;
    expect(await stage()).toBe("TRIAL");
    await pipelineEvent("first_lease", TEST_ACCOUNT_ID, NOW);
    expect(await stage()).toBe("ACTIVE_TRIAL");
    await pipelineEvent("signup", TEST_ACCOUNT_ID, NOW);
    expect(await stage()).toBe("ACTIVE_TRIAL");
    await pipelineEvent("first_payment", TEST_ACCOUNT_ID, NOW);
    expect(await stage()).toBe("PAYING");
    await pipelineEvent("cancelled", TEST_ACCOUNT_ID, NOW);
    expect(await stage()).toBe("LOST");
  });

  it("a lead added by hand is linked when they sign up with the same email", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const l = await createLead(s, lead(), meta, NOW, fakeBrevo().client);
    await pipelineEvent("signup", TEST_ACCOUNT_ID, NOW, {
      name: "Juana",
      email: "juana@example.test",
      company: "x",
    });
    expect(await getLead(s, l.id)).toMatchObject({ accountId: TEST_ACCOUNT_ID, stage: "TRIAL" });
  });

  it("a demo request from the website becomes a New lead", async () => {
    await requestDemo(
      {
        name: "Ben",
        email: "ben@example.test",
        company: "Ben Leasing",
        units: "11–50",
        phone: "",
        message: "",
      },
      { ipAddress: "203.0.113.9", userAgent: "t" },
      NOW,
    );
    const l = await asSystem(() =>
      db.lead.findUniqueOrThrow({ where: { email: "ben@example.test" } }),
    );
    expect(l).toMatchObject({ source: "DEMO_REQUEST", stage: "NEW", marketingConsent: false });
  });
});

describe("import", () => {
  it("imports nothing when a row has a problem, and says which", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const r = await importLeads(s, [{ Name: "Good" }, { Name: "", Email: "x@example.test" }], meta);
    expect(r).toEqual({ created: 0, skipped: 0, errors: [{ row: 3, error: "Name is empty" }] });
    expect(await asSystem(() => db.lead.count())).toBe(0);
  });

  it("imports good rows and skips leads already in the pipeline", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    await createLead(s, lead(), meta, NOW, fakeBrevo().client);
    const r = await importLeads(
      s,
      [
        { Name: "Juana again", Email: "juana@example.test" },
        { Name: "Pedro", Email: "pedro@example.test", Type: "Broker", Source: "Referral" },
        { Name: "Pedro twice", Email: "pedro@example.test" },
        { Name: "No email" },
      ],
      meta,
      NOW,
      fakeBrevo().client,
    );
    expect(r).toEqual({ created: 2, skipped: 2, errors: [] });
  });
});

describe("Brevo and privacy", () => {
  it("unsubscribes come back from Brevo and turn consent off", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const l = await createLead(
      s,
      lead({ marketingConsent: true, consentSource: "Call" }),
      meta,
      NOW,
      fakeBrevo().client,
    );
    expect(await markUnsubscribed("JUANA@example.test", NOW)).toBe(true);
    expect(await getLead(s, l.id)).toMatchObject({ marketingConsent: false });
    expect(await markUnsubscribed("juana@example.test", NOW)).toBe(false);
  });

  it("housekeeping deletes leads lost over 24 months ago and pulls unsubscribes", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const b = fakeBrevo(["fresh@example.test"]);
    const old = await createLead(s, lead({ email: "old@example.test" }), meta, NOW, b.client);
    await createLead(
      s,
      lead({ email: "fresh@example.test", marketingConsent: true, consentSource: "x" }),
      meta,
      NOW,
      b.client,
    );
    await asSystem(() =>
      db.lead.update({
        where: { id: old.id },
        data: { stage: "LOST", lostAt: new Date("2024-10-01T00:00:00Z") },
      }),
    );
    const r = await runPipelineHousekeeping(NOW, b.client);
    expect(r).toMatchObject({ deleted: 1, unsubscribed: 1 });
    expect(b.calls).toContainEqual({ op: "delete", email: "old@example.test" });
    expect(await asSystem(() => db.lead.count())).toBe(1);
  });

  it("a privacy deletion removes the lead here and in Brevo, and logs no personal details", async () => {
    const s = await makeStaff("PLATFORM_SUPPORT");
    const b = fakeBrevo();
    const l = await createLead(s, lead(), meta, NOW, b.client);
    await addLeadActivity(s, l.id, { kind: "NOTE", text: "Lives in Makati" }, meta, NOW);
    await expect(
      deleteLeadForPrivacy(s, l.id, { reason: "" }, meta, b.client),
    ).rejects.toBeInstanceOf(ValidationError);
    await deleteLeadForPrivacy(s, l.id, { reason: "Asked by email" }, meta, b.client);
    expect(await asSystem(() => db.lead.count())).toBe(0);
    expect(await asSystem(() => db.leadActivity.count())).toBe(0);
    expect(b.calls).toContainEqual({ op: "delete", email: "juana@example.test" });
    const log = await asSystem(() =>
      db.staffLog.findFirstOrThrow({ where: { action: "lead.deleted_privacy" } }),
    );
    expect(
      JSON.stringify(log, (_k, v: unknown) => (typeof v === "bigint" ? String(v) : v)),
    ).not.toMatch(/juana|Juana|Makati/);
  });
});
