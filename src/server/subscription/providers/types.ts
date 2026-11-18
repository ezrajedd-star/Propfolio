/**
 * The payment provider behind subscriptions. Propfolio talks to it only through this interface,
 * so each provider (the demo, Xendit) is one file implementing it. Card details never reach Propfolio:
 * people pay on the provider's own hosted checkout page.
 */
export interface CheckoutRequest {
  /** Our Checkout id: the provider sends it back with its messages. */
  checkoutId: string;
  amount: string;
  description: string;
  customerName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutCreated {
  /** The provider's id for this payment; its messages refer to it. */
  providerRef: string;
  /** Where to send the Owner to pay (the provider's hosted page). */
  url: string;
}

export interface RenewalRequest {
  checkoutId: string;
  amount: string;
  description: string;
  /** Where the provider's page sends the Owner after paying, or giving up (pay-by-link). */
  successUrl: string;
  cancelUrl: string;
  /** The subscription's providerRef (saved payment method / provider subscription). */
  subscriptionRef: string | null;
}

/** A provider's message, made provider-neutral. */
export interface ProviderMessage {
  /** The provider's own event id: repeated deliveries carry the same one. */
  eventId: string;
  /** `expired`: an unpaid payment page closed (pay-by-link); nothing was charged. */
  type: "payment.paid" | "payment.failed" | "payment.expired";
  /** The providerRef of the payment it is about. */
  paymentRef: string;
  /** card, gcash, maya… */
  method: string | null;
  /** What we keep in the log: ids, type and amounts only. */
  summary: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  /**
   * True when the provider charges each month by itself (a saved card). False for pay-by-link
   * providers: each renewal is a payment page the Owner is asked to pay within the grace period.
   */
  readonly chargesAutomatically: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutCreated>;
  /**
   * Ask for this month's renewal. Providers that charge by themselves just say which payment to
   * wait for; pay-by-link providers also return the page to pay on. The result arrives as a
   * webhook message.
   */
  requestRenewal(req: RenewalRequest): Promise<{ providerRef: string; payUrl?: string }>;
  /** Check a webhook's signature and read it. Null when it isn't genuine. */
  verifyWebhook(rawBody: string, headers: Headers): ProviderMessage | null;
}
