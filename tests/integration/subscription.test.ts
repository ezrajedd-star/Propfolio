import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/server/auth/authorize";
import { asSystem, db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { OutgoingMail } from "@/server/mail/transport";
import { loadPlanAccess } from "@/server/plans/access";
import { demoWebhook } from "@/server/subscription/providers/demo";
import {
  cancelSubscription,
  choosePlan,
  getSubscriptionView,
  handleProviderWebhook,
  payDemoCheckout,
  runSubscriptionCycle,
  type SubscriptionDeps,
} from "@/server/subscription/service";
import { TEST_ACCOUNT_ID, makeUser, meta, refreshAccess, resetDb } from "./helpers";

beforeEach(resetDb);

// 1 Nov 2026, 10:00 Manila.
const NOV1 = new Date("2026-11-01T02:00:00Z");
const day = (n: number) => new Date(NOV1.getTime() + (n - 1) * 86_400_000);

function mailbox() {
  const sent: OutgoingMail[] = [];
  const deps: SubscriptionDeps = { send: async (m) => void sent.push(m) };
  return { sent, deps, subjects: () => sent.map((m) => m.subject) };
}

async function owner(): Promise<Actor> {
  const o = await makeUser("OWNER");
  await asSystem(() =>
    db.account.update({
      where: { id: TEST_ACCOUNT_ID },
      data: { plan: "PREMIUM", trialEndsAt: day(20) },
    }),
  );
  return refreshAccess(o);
}

const refOf = (url: string) =>
  decodeURIComponent(url.split("/plan/demo-checkout/")[1]!.split("?")[0]!);

async function pay(actor: Actor, plan: "PRO" | "PREMIUM", at: Date, outcome = "card") {
  const r = await choosePlan(actor, { plan }, meta, at);
  if (r.kind !== "checkout") throw new Error(`expected a checkout, got ${r.kind}`);
  return { ref: refOf(r.url), result: await payDemoCheckout(actor, refOf(r.url), { outcome }, at) };
}

const account = () =>
  asSystem(() => db.account.findUniqueOrThrow({ where: { id: TEST_ACCOUNT_ID } }));
const subscription = () =>
  asSystem(() => db.subscription.findUniqueOrThrow({ where: { accountId: TEST_ACCOUNT_ID } }));
const records = () =>
  asSystem(() => db.subscriptionInvoice.findMany({ orderBy: { issuedAt: "asc" } }));

describe("paying for a plan", () => {
  it("from the trial: Pro is paid for a month, the trial ends, a payment record is issued", async () => {
    const o = await owner();
    const { result } = await pay(o, "PRO", NOV1);
    expect(result).toEqual({ status: 200, result: "paid" });

    const a = await account();
    expect(a.plan).toBe("PRO");
    expect(a.trialEndsAt).toBeNull();
    expect(a.paidUntil?.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect((await loadPlanAccess(TEST_ACCOUNT_ID, day(5))).plan).toBe("PRO");

    const [rec] = await records();
    expect(rec).toMatchObject({ number: "PF-2026-000001", plan: "PRO", method: "demo" });
    expect(rec!.amount.toFixed(2)).toBe("1500.00");

    const view = await getSubscriptionView(await refreshAccess(o));
    expect(view.state).toBe("active");
    expect(view.nextCharge).toEqual({ date: "2026-12-01", amount: "1500.00", plan: "PRO" });
  });

  it("a repeated webhook changes nothing; a forged one is refused", async () => {
    const o = await owner();
    const r = await choosePlan(o, { plan: "PRO" }, meta, NOV1);
    if (r.kind !== "checkout") throw new Error("checkout expected");
    const hook = demoWebhook("payment.paid", refOf(r.url), "card");
    expect(await handleProviderWebhook("demo", hook.raw, hook.headers, NOV1)).toEqual({
      status: 200,
      result: "paid",
    });
    expect(await handleProviderWebhook("demo", hook.raw, hook.headers, NOV1)).toEqual({
      status: 200,
      result: "duplicate",
    });
    expect(await records()).toHaveLength(1);

    const forged = new Headers({ "x-demo-signature": "00".repeat(32) });
    expect(
      await handleProviderWebhook("demo", hook.raw.replace("evt_", "evt_x"), forged, NOV1),
    ).toEqual({
      status: 401,
    });
    expect(await handleProviderWebhook("unknown", hook.raw, hook.headers, NOV1)).toEqual({
      status: 401,
    });
    // Every genuine message is logged.
    expect(await asSystem(() => db.providerEvent.count())).toBe(1);
  });

  it("a failed first payment changes nothing", async () => {
    const o = await owner();
    const mail = mailbox();
    const r = await choosePlan(o, { plan: "PRO" }, meta, NOV1, mail.deps);
    if (r.kind !== "checkout") throw new Error("checkout expected");
    expect(await payDemoCheckout(o, refOf(r.url), { outcome: "fail" }, NOV1)).toEqual({
      status: 200,
      result: "failed",
    });
    const a = await account();
    expect(a.plan).toBe("PREMIUM");
    expect(a.trialEndsAt).not.toBeNull();
    expect(await records()).toHaveLength(0);
  });

  it("upgrading in the middle of a month charges the days left, now; the month's end stays", async () => {
    const o = await owner();
    await pay(o, "PRO", NOV1);
    const r = await choosePlan(await refreshAccess(o), { plan: "PREMIUM" }, meta, day(16));
    if (r.kind !== "checkout") throw new Error("checkout expected");
    const checkout = await asSystem(() =>
      db.checkout.findFirstOrThrow({ where: { kind: "UPGRADE" } }),
    );
    // ₱2,000 difference × 15 of 30 days.
    expect(checkout.amount.toFixed(2)).toBe("1000.00");
    await payDemoCheckout(o, refOf(r.url), { outcome: "gcash" }, day(16));
    expect((await account()).plan).toBe("PREMIUM");
    expect((await subscription()).currentPeriodEnd.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect((await records()).at(-1)).toMatchObject({
      method: "gcash",
      description: expect.stringMatching(/Upgrade/),
    });
  });

  it("the Owner only: an Admin can't see or change the subscription", async () => {
    await owner();
    const admin = await makeUser("ADMIN");
    await expect(getSubscriptionView(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(choosePlan(admin, { plan: "PRO" }, meta, NOV1)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("the monthly cycle", () => {
  it("renews at the end of the month: a new period, a new payment record", async () => {
    const o = await owner();
    await pay(o, "PRO", NOV1);
    expect(await runSubscriptionCycle(day(30))).toMatchObject({ renewalsRequested: 0 });
    expect(await runSubscriptionCycle(day(31))).toMatchObject({ renewalsRequested: 1 });
    // Running twice the same day asks only once.
    expect(await runSubscriptionCycle(day(31))).toMatchObject({ renewalsRequested: 0 });
    const s = await subscription();
    expect(s.currentPeriodStart.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(s.currentPeriodEnd.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect((await account()).paidUntil?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect((await records()).map((r) => r.number)).toEqual(["PF-2026-000001", "PF-2026-000002"]);
  });

  it("a failed renewal: 7 days' grace with reminders, then Free; nothing deleted", async () => {
    const o = await owner();
    await pay(o, "PRO", NOV1, "card-renewals-fail");
    const mail = mailbox();
    await runSubscriptionCycle(day(31), mail.deps);
    expect((await subscription()).status).toBe("PAST_DUE");
    // Access continues through the grace period (to 7 Dec).
    expect((await account()).paidUntil?.toISOString().slice(0, 10)).toBe("2026-12-07");
    expect((await loadPlanAccess(TEST_ACCOUNT_ID, day(36))).plan).toBe("PRO");

    await runSubscriptionCycle(day(33), mail.deps); // grace day 3
    await runSubscriptionCycle(day(33), mail.deps); // again: no second reminder
    await runSubscriptionCycle(day(36), mail.deps); // day 6
    expect(mail.subjects().filter((s) => s.startsWith("Reminder"))).toHaveLength(2);

    await runSubscriptionCycle(day(38), mail.deps); // 8 Dec: grace over
    expect((await subscription()).status).toBe("CANCELED");
    expect(mail.subjects()).toContain("Your Propfolio account is now on Free");
    expect((await loadPlanAccess(TEST_ACCOUNT_ID, day(38))).plan).toBe("FREE");
  });

  it("paying during the grace period puts everything back", async () => {
    const o = await owner();
    await pay(o, "PRO", NOV1, "card-renewals-fail");
    await runSubscriptionCycle(day(31));
    await pay(await refreshAccess(o), "PRO", day(33));
    const s = await subscription();
    expect(s.status).toBe("ACTIVE");
    expect(s.currentPeriodStart.toISOString().slice(0, 10)).toBe("2026-12-03");
    expect((await account()).paidUntil?.toISOString().slice(0, 10)).toBe("2027-01-02");
  });

  it("a downgrade waits for the end of the month, then costs the lower price", async () => {
    const o = await owner();
    await pay(o, "PREMIUM", NOV1);
    expect(await choosePlan(await refreshAccess(o), { plan: "PRO" }, meta, day(10))).toMatchObject({
      kind: "scheduled",
    });
    expect((await account()).plan).toBe("PREMIUM");
    await runSubscriptionCycle(day(31));
    expect((await account()).plan).toBe("PRO");
    expect((await records()).at(-1)!.amount.toFixed(2)).toBe("1500.00");
  });

  it("cancelling keeps the plan to the end of the month, then the account is on Free", async () => {
    const o = await owner();
    await pay(o, "PRO", NOV1);
    expect(await cancelSubscription(await refreshAccess(o), meta)).toEqual({ until: "2026-11-30" });
    expect(await runSubscriptionCycle(day(31))).toMatchObject({ renewalsRequested: 0, ended: 1 });
    expect((await subscription()).status).toBe("CANCELED");
    expect((await loadPlanAccess(TEST_ACCOUNT_ID, day(31))).plan).toBe("FREE");
    expect(await records()).toHaveLength(1);
  });
});
