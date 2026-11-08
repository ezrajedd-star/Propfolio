import { createHmac, timingSafeEqual } from "node:crypto";

import { appSecret } from "@/server/env";
import { randomToken } from "@/server/auth/tokens";
import type { PaymentProvider, ProviderMessage } from "./types";

/**
 * The demo provider: a simulated hosted checkout inside Propfolio, for the test site and
 * development until PayMongo is connected. It never handles real money and is refused in
 * production (see providerFor). Its "webhooks" are signed with a key derived from APP_SECRET and
 * go through exactly the same handling as a real provider's.
 */
export const DEMO_PROVIDER = "demo";

/** A renewal of a subscription paid with this demo card fails (to try the grace period). */
export const DEMO_FAILING_CARD = "demo-card-fails";
export const DEMO_CARD = "demo-card";

function demoKey(): Buffer {
  return createHmac("sha256", appSecret()).update("demo-payment-webhooks").digest();
}

export function signDemoWebhook(rawBody: string): string {
  return createHmac("sha256", demoKey()).update(rawBody).digest("hex");
}

export interface DemoEventBody {
  id: string;
  type: "payment.paid" | "payment.failed";
  data: { payment: string; method: string | null };
}

/** Build a signed demo message, as if the provider sent it. */
export function demoWebhook(type: DemoEventBody["type"], payment: string, method: string | null) {
  const body: DemoEventBody = {
    id: `evt_demo_${randomToken().slice(0, 20)}`,
    type,
    data: { payment, method },
  };
  const raw = JSON.stringify(body);
  return { raw, headers: new Headers({ "x-demo-signature": signDemoWebhook(raw) }) };
}

export const demoProvider: PaymentProvider = {
  name: DEMO_PROVIDER,

  async createCheckout(req) {
    const providerRef = `demo_pay_${randomToken().slice(0, 24)}`;
    return {
      providerRef,
      url: `/plan/demo-checkout/${encodeURIComponent(providerRef)}?c=${req.checkoutId}`,
    };
  },

  async requestRenewal() {
    return { providerRef: `demo_pay_${randomToken().slice(0, 24)}` };
  },

  verifyWebhook(rawBody, headers): ProviderMessage | null {
    const sig = headers.get("x-demo-signature") ?? "";
    const expected = signDemoWebhook(rawBody);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const body = JSON.parse(rawBody) as DemoEventBody;
      if (typeof body.id !== "string" || typeof body.data?.payment !== "string") return null;
      if (body.type !== "payment.paid" && body.type !== "payment.failed") return null;
      return {
        eventId: body.id,
        type: body.type,
        paymentRef: body.data.payment,
        method: body.data.method ?? null,
        summary: {
          id: body.id,
          type: body.type,
          payment: body.data.payment,
          method: body.data.method,
        },
      };
    } catch {
      return null;
    }
  },
};
