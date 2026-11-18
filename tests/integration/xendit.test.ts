import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.PAYMENT_PROVIDER = "xendit";
process.env.XENDIT_SECRET_KEY = "xnd_development_test";
process.env.XENDIT_CALLBACK_TOKEN = "cb-token";

import type { Actor } from "@/server/auth/authorize";
import { asSystem, db } from "@/server/db";
import type { OutgoingMail } from "@/server/mail/transport";
import {
  choosePlan,
  getSubscriptionView,
  handleProviderWebhook,
  runSubscriptionCycle,
  type SubscriptionDeps,
} from "@/server/subscription/service";
import { TEST_ACCOUNT_ID, makeUser, meta, refreshAccess, resetDb } from "./helpers";

/** Paying with Xendit invoices (Xendit's API is faked; nothing leaves the machine). */
const NOV1 = new Date("2026-11-01T02:00:00Z");
const day = (n: number) => new Date(NOV1.getTime() + (n - 1) * 86_400_000);

let invoices = 0;
const created: Record<string, unknown>[] = [];

beforeEach(async () => {
  await resetDb();
  invoices = 0;
  created.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      created.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      invoices++;
      return new Response(
        JSON.stringify({
          id: `inv_${invoices}`,
          invoice_url: `https://checkout.xendit.co/web/inv_${invoices}`,
          status: "PENDING",
        }),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mailbox() {
  const sent: OutgoingMail[] = [];
  const deps: SubscriptionDeps = { send: async (m) => void sent.push(m) };
  return { sent, deps };
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

const webhook = (id: string, status: string, token = "cb-token", channel = "GCASH") =>
  handleProviderWebhook(
    "xendit",
    JSON.stringify({
      id,
      status,
      payment_channel: channel,
      payment_method: "EWALLET",
      amount: 1500,
    }),
    new Headers({ "x-callback-token": token }),
    day(1),
    mailbox().deps,
  );

const subscription = () =>
  asSystem(() => db.subscription.findUniqueOrThrow({ where: { accountId: TEST_ACCOUNT_ID } }));

describe("Xendit", () => {
  it("Choose Pro → Xendit's page → paid by GCash → Pro for a month", async () => {
    const o = await owner();
    const r = await choosePlan(o, { plan: "PRO" }, meta, day(1));
    expect(r).toEqual({ kind: "checkout", url: "https://checkout.xendit.co/web/inv_1" });
    expect(created[0]).toMatchObject({ amount: 1500, currency: "PHP" });

    expect(await webhook("inv_1", "PAID", "forged")).toEqual({ status: 401 });
    expect(await webhook("inv_1", "PAID")).toEqual({ status: 200, result: "paid" });
    expect(await webhook("inv_1", "PAID")).toEqual({ status: 200, result: "duplicate" });
    // Xendit's later "settled" message for the same invoice changes nothing.
    expect(await webhook("inv_1", "SETTLED")).toEqual({ status: 200, result: "ignored" });

    const sub = await subscription();
    expect(sub).toMatchObject({ plan: "PRO", status: "ACTIVE", provider: "xendit" });
    const [rec] = await asSystem(() => db.subscriptionInvoice.findMany());
    expect(rec).toMatchObject({ method: "gcash" });
  });

  it("a delivery that stopped half-way is finished when Xendit retries", async () => {
    const o = await owner();
    await choosePlan(o, { plan: "PRO" }, meta, day(1));
    // As if the server stopped right after logging the message.
    await asSystem(() =>
      db.providerEvent.create({
        data: {
          provider: "xendit",
          providerEventId: "inv_1:PAID",
          type: "payment.paid",
          payload: {},
        },
      }),
    );
    expect(await webhook("inv_1", "PAID")).toEqual({ status: 200, result: "paid" });
    expect(await subscription()).toMatchObject({ status: "ACTIVE", plan: "PRO" });
    expect(await webhook("inv_1", "PAID")).toEqual({ status: 200, result: "duplicate" });
  });

  it("each month a payment page is made; the Owner has the grace period to pay it", async () => {
    const o = await owner();
    await choosePlan(o, { plan: "PRO" }, meta, day(1));
    await webhook("inv_1", "PAID");
    const box = mailbox();

    // 1 Dec: renewal is due.
    const r = await runSubscriptionCycle(day(31), box.deps);
    expect(r.renewalsRequested).toBe(1);
    expect(created[1]).toMatchObject({ amount: 1500, invoice_duration: 7 * 86400 });
    expect(await subscription()).toMatchObject({ status: "PAST_DUE" });
    expect(box.sent.map((m) => m.subject)).toEqual([
      "Your Propfolio payment for this month is ready",
    ]);
    const acct = await asSystem(() =>
      db.account.findUniqueOrThrow({ where: { id: TEST_ACCOUNT_ID } }),
    );
    expect(acct.paidUntil?.toISOString().slice(0, 10)).toBe("2026-12-07");

    // Running again the same day asks for nothing more.
    expect((await runSubscriptionCycle(day(31), box.deps)).renewalsRequested).toBe(0);

    // "Pay now" reopens the same page rather than making a second.
    const view = await getSubscriptionView(await refreshAccess(o));
    expect(view.awaitingPayment).toBe(true);
    expect(await choosePlan(await refreshAccess(o), { plan: "PRO" }, meta, day(32))).toEqual({
      kind: "checkout",
      url: "https://checkout.xendit.co/web/inv_2",
    });
    expect(invoices).toBe(2);

    // Paid: the new month runs.
    expect(await webhook("inv_2", "PAID")).toEqual({ status: 200, result: "paid" });
    expect(await subscription()).toMatchObject({ status: "ACTIVE" });
  });

  it("an expired page charges nothing and sends no 'failed' email; Pay now makes a new page", async () => {
    const o = await owner();
    await choosePlan(o, { plan: "PRO" }, meta, day(1));
    await webhook("inv_1", "PAID");
    await runSubscriptionCycle(day(31), mailbox().deps);
    expect(await webhook("inv_2", "EXPIRED")).toEqual({ status: 200, result: "expired" });
    const c = await asSystem(() =>
      db.checkout.findFirstOrThrow({ where: { providerRef: "inv_2" } }),
    );
    expect(c.status).toBe("EXPIRED");
    const r = await choosePlan(await refreshAccess(o), { plan: "PRO" }, meta, day(33));
    expect(r).toEqual({ kind: "checkout", url: "https://checkout.xendit.co/web/inv_3" });
  });

  it("not paid by the end of the grace period: the account moves to Free", async () => {
    const o = await owner();
    await choosePlan(o, { plan: "PRO" }, meta, day(1));
    await webhook("inv_1", "PAID");
    await runSubscriptionCycle(day(31), mailbox().deps);
    const r = await runSubscriptionCycle(day(39), mailbox().deps);
    expect(r.ended).toBe(1);
    expect(await subscription()).toMatchObject({ status: "CANCELED" });
  });
});
