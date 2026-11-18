import { timingSafeEqual } from "node:crypto";

import { GRACE_DAYS } from "@/domain/subscription/subscription";
import { env } from "@/server/env";
import type { CheckoutCreated, PaymentProvider, ProviderMessage } from "./types";

/**
 * Xendit, through its Invoices API: each payment is a Xendit invoice, paid on Xendit's own page
 * (card, GCash, Maya and whatever else is turned on in the Xendit dashboard). Xendit doesn't
 * charge saved GCash/Maya accounts monthly by itself here, so renewals are pay-by-link: each
 * month a new invoice is made and the Owner is asked to pay it within the grace period.
 *
 * API: POST https://api.xendit.co/v2/invoices with Basic auth (secret key as the user name).
 * Webhooks ("invoice paid", and "invoice expired" when turned on) carry the dashboard's
 * verification token in the `x-callback-token` header; the body is not signed.
 */
export const XENDIT_PROVIDER = "xendit";
const API = "https://api.xendit.co";
/** A new checkout's page stays open a day; a renewal's for the grace period. */
const CHECKOUT_SECONDS = 24 * 3600;
const RENEWAL_SECONDS = GRACE_DAYS * 24 * 3600;

type Fetch = typeof fetch;

export interface XenditConfig {
  secretKey: string;
  callbackToken: string;
  fetch?: Fetch;
}

interface XenditInvoice {
  id: string;
  invoice_url: string;
  status: string;
}

export class XenditError extends Error {
  constructor(public readonly status: number) {
    // Never the response body: it can echo the customer's details.
    super(`Xendit answered ${status}`);
    this.name = "XenditError";
  }
}

/** Xendit's payment channel → our short method name. */
export function xenditMethod(channel: unknown, method: unknown): string | null {
  const c = typeof channel === "string" ? channel.toUpperCase() : "";
  const m = typeof method === "string" ? method.toUpperCase() : "";
  if (c === "GCASH") return "gcash";
  if (c === "PAYMAYA" || c === "MAYA") return "maya";
  if (m === "CREDIT_CARD" || c === "CREDIT_CARD") return "card";
  if (c === "GRABPAY") return "grabpay";
  if (c === "SHOPEEPAY") return "shopeepay";
  if (m === "DIRECT_DEBIT") return "direct debit";
  if (m === "BANK_TRANSFER" || m === "CALLBACK_VIRTUAL_ACCOUNT" || m === "POOL")
    return "bank transfer";
  if (m === "RETAIL_OUTLET") return "over the counter";
  if (m === "QR_CODE") return "QR Ph";
  return c ? c.toLowerCase() : m ? m.toLowerCase() : null;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function xenditProvider(config: XenditConfig): PaymentProvider {
  const doFetch = config.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`;

  async function createInvoice(body: Record<string, unknown>): Promise<XenditInvoice> {
    const res = await doFetch(`${API}/v2/invoices`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        // Xendit returns the same invoice for a repeated request with the same key.
        "X-IDEMPOTENCY-KEY": String(body.external_id),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new XenditError(res.status);
    const inv = (await res.json()) as Partial<XenditInvoice>;
    if (typeof inv.id !== "string" || typeof inv.invoice_url !== "string") {
      throw new XenditError(502);
    }
    return { id: inv.id, invoice_url: inv.invoice_url, status: String(inv.status ?? "") };
  }

  return {
    name: XENDIT_PROVIDER,
    chargesAutomatically: false,

    async createCheckout(req): Promise<CheckoutCreated> {
      const inv = await createInvoice({
        external_id: req.checkoutId,
        amount: Number(req.amount),
        currency: "PHP",
        description: req.description,
        invoice_duration: CHECKOUT_SECONDS,
        payer_email: req.customerEmail,
        customer: { given_names: req.customerName, email: req.customerEmail },
        success_redirect_url: req.successUrl,
        failure_redirect_url: req.cancelUrl,
        locale: "en",
      });
      return { providerRef: inv.id, url: inv.invoice_url };
    },

    async requestRenewal(req) {
      const inv = await createInvoice({
        external_id: req.checkoutId,
        amount: Number(req.amount),
        currency: "PHP",
        description: req.description,
        invoice_duration: RENEWAL_SECONDS,
        success_redirect_url: req.successUrl,
        failure_redirect_url: req.cancelUrl,
        locale: "en",
      });
      return { providerRef: inv.id, payUrl: inv.invoice_url };
    },

    verifyWebhook(rawBody, headers): ProviderMessage | null {
      if (!sameSecret(headers.get("x-callback-token") ?? "", config.callbackToken)) return null;
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return null;
      }
      const id = body.id;
      const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
      if (typeof id !== "string" || !id) return null;
      const type =
        status === "PAID" || status === "SETTLED"
          ? ("payment.paid" as const)
          : status === "EXPIRED"
            ? ("payment.expired" as const)
            : null;
      if (!type) return null;
      return {
        // Xendit has no event id: the invoice and its status identify a delivery.
        eventId: `${id}:${status}`,
        type,
        paymentRef: id,
        method: xenditMethod(body.payment_channel, body.payment_method),
        // Ids, status and amounts only: never the payer's email or name.
        summary: {
          id,
          externalId: body.external_id ?? null,
          status,
          amount: body.amount ?? null,
          paidAmount: body.paid_amount ?? null,
          currency: body.currency ?? null,
          paymentMethod: body.payment_method ?? null,
          paymentChannel: body.payment_channel ?? null,
        },
      };
    },
  };
}

/** The configured Xendit provider, or null when its keys aren't set. */
export function configuredXendit(): PaymentProvider | null {
  const e = env();
  if (!e.XENDIT_SECRET_KEY || !e.XENDIT_CALLBACK_TOKEN) return null;
  return xenditProvider({ secretKey: e.XENDIT_SECRET_KEY, callbackToken: e.XENDIT_CALLBACK_TOKEN });
}
