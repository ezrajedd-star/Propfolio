import { describe, expect, it } from "vitest";

import { xenditMethod, xenditProvider, XenditError } from "./xendit";

const TOKEN = "callback-token-123";

function fakeFetch(
  status = 200,
  body: unknown = {
    id: "inv_1",
    invoice_url: "https://checkout.xendit.co/web/inv_1",
    status: "PENDING",
  },
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const provider = (f: typeof fetch) =>
  xenditProvider({ secretKey: "xnd_development_abc", callbackToken: TOKEN, fetch: f });

const hook = (body: Record<string, unknown>, token = TOKEN) => ({
  raw: JSON.stringify(body),
  headers: new Headers({ "x-callback-token": token }),
});

describe("Xendit invoices", () => {
  it("creates an invoice in pesos, with Basic auth and our checkout id", async () => {
    const { f, calls } = fakeFetch();
    const r = await provider(f).createCheckout({
      checkoutId: "chk_1",
      amount: "1500.00",
      description: "Propfolio Pro, one month",
      customerName: "Owen Owner",
      customerEmail: "owen@example.com",
      successUrl: "https://propfolioph.com/plan?payment=paid",
      cancelUrl: "https://propfolioph.com/plan",
    });
    expect(r).toEqual({ providerRef: "inv_1", url: "https://checkout.xendit.co/web/inv_1" });
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.xendit.co/v2/invoices");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("xnd_development_abc:").toString("base64")}`,
    );
    expect(headers["X-IDEMPOTENCY-KEY"]).toBe("chk_1");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      external_id: "chk_1",
      amount: 1500,
      currency: "PHP",
      payer_email: "owen@example.com",
      success_redirect_url: "https://propfolioph.com/plan?payment=paid",
      invoice_duration: 86400,
    });
  });

  it("renewal pages stay open for the grace period and come back as a pay link", async () => {
    const { f, calls } = fakeFetch();
    const r = await provider(f).requestRenewal({
      checkoutId: "chk_2",
      amount: "3500.00",
      description: "x",
      subscriptionRef: null,
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(r).toEqual({ providerRef: "inv_1", payUrl: "https://checkout.xendit.co/web/inv_1" });
    expect(JSON.parse(String(calls[0]!.init.body)).invoice_duration).toBe(7 * 86400);
  });

  it("an error from Xendit names only the status code", async () => {
    const { f } = fakeFetch(400, { message: "payer owen@example.com invalid" });
    const err = await provider(f)
      .createCheckout({
        checkoutId: "c",
        amount: "1",
        description: "d",
        customerName: "n",
        customerEmail: "e",
        successUrl: "s",
        cancelUrl: "c",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(XenditError);
    expect((err as Error).message).toBe("Xendit answered 400");
  });

  it("accepts webhooks only with the right token", () => {
    const p = provider(fakeFetch().f);
    const body = {
      id: "inv_1",
      external_id: "chk_1",
      status: "PAID",
      payment_channel: "GCASH",
      payer_email: "owen@example.com",
    };
    expect(p.verifyWebhook(hook(body, "wrong").raw, hook(body, "wrong").headers)).toBeNull();
    expect(p.verifyWebhook(hook(body).raw, new Headers())).toBeNull();
    const msg = p.verifyWebhook(hook(body).raw, hook(body).headers);
    expect(msg).toMatchObject({
      eventId: "inv_1:PAID",
      type: "payment.paid",
      paymentRef: "inv_1",
      method: "gcash",
    });
    expect(JSON.stringify(msg!.summary)).not.toContain("owen@example.com");
  });

  it.each([
    ["PAID", "payment.paid"],
    ["SETTLED", "payment.paid"],
    ["EXPIRED", "payment.expired"],
    ["PENDING", null],
  ])("status %s → %s", (status, type) => {
    const p = provider(fakeFetch().f);
    const h = hook({ id: "inv_9", status });
    expect(p.verifyWebhook(h.raw, h.headers)?.type ?? null).toBe(type);
  });

  it("ignores bodies that aren't invoices", () => {
    const p = provider(fakeFetch().f);
    for (const raw of ["not json", JSON.stringify({ status: "PAID" })]) {
      expect(p.verifyWebhook(raw, new Headers({ "x-callback-token": TOKEN }))).toBeNull();
    }
  });

  it.each([
    ["GCASH", "EWALLET", "gcash"],
    ["PAYMAYA", "EWALLET", "maya"],
    ["", "CREDIT_CARD", "card"],
    ["BPI", "DIRECT_DEBIT", "direct debit"],
    ["7ELEVEN", "RETAIL_OUTLET", "over the counter"],
    ["", "QR_CODE", "QR Ph"],
    [undefined, undefined, null],
  ])("channel %s / method %s → %s", (channel, method, expected) => {
    expect(xenditMethod(channel, method)).toBe(expected);
  });
});
