import { env } from "@/server/env";
import { demoProvider } from "./demo";
import type { PaymentProvider } from "./types";

/**
 * The provider for new payments. Today only the demo provider exists (PayMongo isn't taking new
 * merchants yet); add `paymongo` here when its adapter is written. The demo provider is refused
 * on a production server that isn't the test site, so nobody can "pay" with a pretend card.
 */
export function activeProvider(): PaymentProvider | null {
  const e = env();
  const demoAllowed = e.NODE_ENV !== "production" || e.UAT_MODE;
  if (e.PAYMENT_PROVIDER === "demo") return demoAllowed ? demoProvider : null;
  return null;
}

/** For webhooks and renewals: the provider a payment or subscription belongs to. */
export function providerFor(name: string): PaymentProvider | null {
  if (name === demoProvider.name) return activeProvider() === demoProvider ? demoProvider : null;
  return null;
}
