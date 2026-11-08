/**
 * The payment provider behind subscriptions. Propfolio talks to it only through this interface,
 * so PayMongo (or Xendit later) is one file implementing it. Card details never reach Propfolio:
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
  /** The subscription's providerRef (saved payment method / provider subscription). */
  subscriptionRef: string | null;
}

/** A provider's message, made provider-neutral. */
export interface ProviderMessage {
  /** The provider's own event id: repeated deliveries carry the same one. */
  eventId: string;
  type: "payment.paid" | "payment.failed";
  /** The providerRef of the payment it is about. */
  paymentRef: string;
  /** card, gcash, maya… */
  method: string | null;
  /** What we keep in the log: ids, type and amounts only. */
  summary: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutCreated>;
  /**
   * Ask for this month's renewal. Providers that charge subscriptions by themselves (PayMongo)
   * just say which payment to wait for; the result arrives as a webhook message.
   */
  requestRenewal(req: RenewalRequest): Promise<{ providerRef: string }>;
  /** Check a webhook's signature and read it. Null when it isn't genuine. */
  verifyWebhook(rawBody: string, headers: Headers): ProviderMessage | null;
}
